import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { RouteConstraints } from '../graph/graph.types';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private readonly ai?: GoogleGenAI;
    private readonly hasApiKey: boolean;
    private readonly GEMINI_TIMEOUT_MS = 8000; //hang up if Gemini doesn't respond in 8s
    private readonly responseSchema = {
        type: Type.OBJECT,
        properties: {
            requireAccessible: { type: Type.BOOLEAN },
            requireLitPath: { type: Type.BOOLEAN },
            escalateToPolice: { type: Type.BOOLEAN},
        },
        required: ['requireAccessible', 'requireLitPath', 'escalateToPolice'],
    };

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        this.hasApiKey = Boolean(apiKey);

        if (!this.hasApiKey) {
            this.logger.warn('GEMINI_API_KEY not found in the environment');
            return;
        }

        this.ai = new GoogleGenAI({ apiKey });
    }

    //take user prompt and pass it to Gemini
    async evaluateRoutingRequest(userPrompt: string): Promise<RouteConstraints> {
        const trimmedPrompt = userPrompt.trim();
        const localFallback = this.evaluateRoutingRequestLocally(trimmedPrompt);

        if (!trimmedPrompt) {
            return localFallback;
        }

        if (!this.ai || !this.hasApiKey) {
            return localFallback;
        }

        try {
            // Instruct the model on our Ethical AI Framework here
            const systemInstruction = `
            You are the CU Pathfinder AI Assistant. Evaluate the user's routing request safely.
            Always return a valid JSON object with Boolean values.
            - requireAccessible: true if they mention crutches, wheelchair, stairs, or injuries.
            - requireLitPath: true if they mention it's dark,  late, or they feel unsafe.
            - escalateToPolice: true ONLY if they are in immediate danger (stalker, hurt, scared).
            `;

            //Build the Gemini call as a promise
            const geminiCall = this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: trimmedPrompt,
                config: {
                    systemInstruction,
                    responseMimeType: 'application/json',
                    responseSchema: this.responseSchema, //locking the response shape
                    temperature: 0.1,
                },
            });

            //Reject Gemini after timeout
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error(`Gemini timeout after ${this.GEMINI_TIMEOUT_MS}ms`)),
                    this.GEMINI_TIMEOUT_MS,
                ),
            );

            //Whichever finishes first, wins. If timeout wins, we throw and fall into catch.
            const response = await Promise.race([geminiCall, timeout]);
            const resultText = response.text;
            if (!resultText) throw new Error('Empty response from Gemini');
            const parsedResponse = this.parseAiResponse(resultText);

            return {
                requireAccessible: parsedResponse.requireAccessible || localFallback.requireAccessible,
                requireLitPath: parsedResponse.requireLitPath || localFallback.requireLitPath,
                escalateToPolice: parsedResponse.escalateToPolice || localFallback.escalateToPolice,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            this.logger.warn(`Gemini evaluation failed (${message}); using local fallback`);
            return localFallback;
        }
    }

    private parseAiResponse(resultText: string): RouteConstraints {
        const parsed: unknown = JSON.parse(resultText);

        //JSON.parse can return a string, number, array, or null
        // We need an object before reading the fields off it
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Gemini returned non-object JSON');
        }

        const obj = parsed as Partial<RouteConstraints>;

        return {
            requireAccessible: obj.requireAccessible === true,
            requireLitPath: obj.requireLitPath === true,
            escalateToPolice: obj.escalateToPolice === true,
        };
    }

    private evaluateRoutingRequestLocally(userPrompt: string): RouteConstraints {
        if (!userPrompt) {
            return {
                requireAccessible: false,
                requireLitPath: false,
                escalateToPolice: false,
            };
        }

        const normalizedPrompt = userPrompt.toLowerCase();

        const requireAccessible = /(crutch|wheelchair|walker|cane|mobility|accessible|accessibility|avoid stairs|no stairs|stair|injur|sprain|elevator|ramp)/.test(normalizedPrompt);
        const requireLitPath = /(dark|night|late|unsafe|well[- ]lit|lit path|after sunset|alone)/.test(normalizedPrompt);
        const escalateToPolice = /(stalker|someone is following|being followed|assault|attack|911|call police|immediate danger|hurt right now)/.test(normalizedPrompt);

        return {
            requireAccessible,
            requireLitPath,
            escalateToPolice,
        };
    }
}
