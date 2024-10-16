import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsLoggedInAndLastHeartbeat1234567890123 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE user ADD COLUMN isLoggedIn BOOLEAN DEFAULT false`);
        await queryRunner.query(`ALTER TABLE user ADD COLUMN lastHeartbeat DATETIME`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE user DROP COLUMN lastHeartbeat`);
        await queryRunner.query(`ALTER TABLE user DROP COLUMN isLoggedIn`);
    }
}