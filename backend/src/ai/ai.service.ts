import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private readonly ai: GoogleGenAI;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            this.logger.warn('GEMINI_API_KEY not found in the environment');
        }
        this.ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });
    }

    //take user prompt and pass it to Gemini
    async evaluateRoutingRequest(userPrompt: string): Promise<{ requireAccessible: boolean, requireLitPath: boolean, escalateToPolice: boolean }> {
        try {
            // Instruct the model on our Ethical AI Framework here
            const systemInstruction = `
            You are the CU Pathfinder AI Assistant. Evaluate the user's routing request safely.
            Always return a valid JSON object with Boolean values.
            - requireAccessible: true if they mention crutches, wheelchair, stairs, or injuries.
            - requireLitPath: true if they mention it's dark,  late, or they feel unsafe.
            - escalateToPolice: true ONLY if they are in immediate danger (stalker, hurt, scared).
            `;
            const response = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: userPrompt,
                config: {
                    systemInstruction: systemInstruction, responseMimeType: 'application/json', temperature: 0.1,
                },
            });
            const resultText = response.text;
            if (!resultText) throw new Error('Empty response from Gemini');
            return JSON.parse(resultText);
        } catch (error) {
            this.logger.error('Failed to evaluate path with Gemini', error);
            return {
                requireAccessible: true,
                requireLitPath: true,
                escalateToPolice: false
            };
        }
    }
}