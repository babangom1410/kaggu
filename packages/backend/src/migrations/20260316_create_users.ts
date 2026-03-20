import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('name', 255).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_login_at').nullable();
    table.timestamps(true, true);

    table.index('email');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('users');
}
