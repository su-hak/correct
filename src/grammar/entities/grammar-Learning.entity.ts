import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class GrammarLearning {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  originalText: string;

  @Column('text')
  correctedText: string;

  @Column('float')
  confidence: number;

  @Column('int', { default: 1 })
  useCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column('simple-array', { nullable: true })
  alternativeSentences: string[];
}