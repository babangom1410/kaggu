import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('organizations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.string('slug', 100).notNullable().unique();
    table.string('contact_email', 255).notNullable();
    table.string('contact_name', 255).notNullable();
    table.specificType('country', 'char(2)').nullable();
    table.jsonb('metadata').nullable().defaultTo('{}');
    table.enu('status', ['active', 'suspended', 'deleted']).notNullable().defaultTo('active');
    table.timestamps(true, true);

    table.index('slug');
    table.index('status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('organizations');
}
