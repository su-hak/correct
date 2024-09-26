module.exports = {
    type: 'mariadb',
    url: process.env.JAWSDB_MARIA_URL,
    entities: ['dist/**/*.entity{.ts,.js}'],
    migrations: ['dist/migrations/*{.ts,.js}'],
    cli: {
      migrationsDir: 'src/migrations',
    },
  };