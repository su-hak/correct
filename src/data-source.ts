import { DataSource } from "typeorm";
import { User } from "./users/entities/users.entity";

export const AppDataSource = new DataSource({
  type: "mariadb",
  url: process.env.JAWSDB_MARIA_URL,
  entities: [User],
  migrations: ["dist/migrations/*.js"],
  synchronize: false,
});