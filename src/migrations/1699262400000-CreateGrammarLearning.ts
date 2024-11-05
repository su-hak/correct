// src/migrations/1699262400000-CreateGrammarLearning.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGrammarLearning1699262400000 implements MigrationInterface {
    name = 'CreateGrammarLearning1699262400000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE grammar_learning (
                id INT NOT NULL AUTO_INCREMENT,
                original_text TEXT NOT NULL,
                corrected_text TEXT NOT NULL,
                confidence FLOAT NOT NULL,
                use_count INT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                alternative_sentences TEXT,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE grammar_learning`);
    }
}