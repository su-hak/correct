import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateGrammarLearning1699353600000 implements MigrationInterface {
    name = 'CreateGrammarLearning1699353600000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(new Table({
            name: 'grammar_learning',
            columns: [
                {
                    name: 'id',
                    type: 'int',
                    isPrimary: true,
                    isGenerated: true,
                    generationStrategy: 'increment'
                },
                {
                    name: 'original_text',
                    type: 'text',
                    isNullable: false
                },
                {
                    name: 'corrected_text',
                    type: 'text',
                    isNullable: false
                },
                {
                    name: 'confidence',
                    type: 'float',
                    isNullable: false,
                    default: 1.0
                },
                {
                    name: 'use_count',
                    type: 'int',
                    default: 1
                },
                {
                    name: 'created_at',
                    type: 'timestamp',
                    default: 'CURRENT_TIMESTAMP'
                },
                {
                    name: 'alternative_sentences',
                    type: 'text',
                    isNullable: true
                }
            ]
        }), true);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('grammar_learning');
    }
}