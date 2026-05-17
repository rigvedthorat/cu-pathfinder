import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class RouteRequestDto {
    @IsOptional()
    @IsString()
    @MaxLength(500)
    prompt?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    start!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    end!: string;
}