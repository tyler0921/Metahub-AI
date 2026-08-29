import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReadNoteQueryDto {
  /** 볼트 루트 기준 상대 경로 */
  @IsString()
  @IsNotEmpty({ message: '노트 경로를 지정하세요.' })
  @MaxLength(500)
  path!: string;
}
