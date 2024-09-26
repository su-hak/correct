import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateUserTable1234567890123 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(new Table({
            name: "users",
            columns: [
                {
                    name: "id",
                    type: "varchar",
                    length: "50",
                    isPrimary: true,
                },
                {
                    name: "token",
                    type: "varchar",
                    length: "255",
                },
                {
                    name: "name",
                    type: "varchar",
                    length: "100",
                },
                {
                    name: "contact",
                    type: "varchar",
                    length: "100",
                },
                {
                    name: "expiryDate",
                    type: "datetime",
                },
                {
                    name: "createdAt",
                    type: "timestamp",
                    default: "CURRENT_TIMESTAMP",
                },
                {
                    name: "updatedAt",
                    type: "timestamp",
                    default: "CURRENT_TIMESTAMP",
                    onUpdate: "CURRENT_TIMESTAMP",
                }
            ],
            indices: [
                {
                    name: "IDX_USER_TOKEN",
                    columnNames: ["token"]
                },
                {
                    name: "IDX_USER_EXPIRY_DATE",
                    columnNames: ["expiryDate"]
                }
            ]
        }), true);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable("users");
    }
}