import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('projects', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('name', 200).notNullable().defaultTo('Nouveau projet');
    table.jsonb('nodes').notNullable().defaultTo('[]');
    table.jsonb('edges').notNullable().defaultTo('[]');
    table.jsonb('moodle_config').nullable();
    table.timestamps(true, true);

    table.index('user_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('projects');
}
