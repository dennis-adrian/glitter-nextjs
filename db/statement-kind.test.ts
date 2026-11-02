import { describe, expect, it } from "vitest";

import { classifyStatement, stripSqlNoise } from "@/db/statement-kind";

describe("classifyStatement", () => {
  it.each([
    ['select "id" from "users" where "users"."clerk_id" = $1'],
    ["SELECT 1"],
    ["  (select 1) union (select 2)"],
    ['select * from "stands" where "id" = $1 for update'],
    ['select * from "stands" for no key update skip locked'],
    ["values (1), (2)"],
    ["table users"],
    ["show search_path"],
    ["explain select * from users"],
    ["explain (format json) select * from users"],
    ["begin"],
    ["BEGIN ISOLATION LEVEL SERIALIZABLE"],
    ["commit"],
    ["rollback"],
    ["savepoint sp1"],
    ["release savepoint sp1"],
    ["rollback to savepoint sp1"],
    ["set local statement_timeout = 1000"],
    ["lock table stands in share mode"],
    [
      'with "recent" as (select * from "orders" where "created_at" > now()) select count(*) from "recent"',
    ],
    [
      "with locked as (select id from jobs for update skip locked) select * from locked",
    ],
    ['select "updated_at", "deleted_at" from "users"'],
    ["select 'delete from users' as text"],
    ['select "update" from "weird"'],
    ["select E'it\\'s an insert' as text"],
    ["select $$ delete from users $$"],
    ["select $tag$ update users set x = 1 $tag$"],
    ["-- insert into users\nselect 1"],
    ["/* update users /* nested */ set x = 1 */ select 1"],
    ["select nextval('users_id_seq')"],
    [""],
    ["   "],
    ["-- nothing here"],
  ])("reads: %s", (sql) => {
    expect(classifyStatement(sql)).toBe("read");
  });

  it.each([
    ['insert into "users" ("clerk_id") values ($1)'],
    ['INSERT INTO "users" DEFAULT VALUES'],
    ['update "users" set "status" = $1 where "id" = $2'],
    ['delete from "carts" where "id" = $1'],
    [
      "merge into stock using incoming on true when matched then update set n = 1",
    ],
    ["truncate users"],
    ["create table t (id int)"],
    ["alter table users add column x int"],
    ["drop table users"],
    ["copy users from stdin"],
    ["call do_things()"],
    ["do $$ begin delete from users; end $$"],
    ["refresh materialized view stats"],
    ["grant select on users to someone"],
    ["vacuum users"],
    [
      'with "moved" as (delete from "holds" where "expires_at" < now() returning *) select count(*) from "moved"',
    ],
    [
      "with claimed as (select id from jobs for update skip locked limit 1) update jobs set taken = true where id in (select id from claimed)",
    ],
    [
      'with x as (insert into "events" ("kind") values ($1) returning id) select id from x',
    ],
    ["  (insert into t values (1))"],
    ["select * into new_table from users"],
    ["select 1; delete from users"],
    ["explain analyze delete from users"],
    ["explain (analyze, buffers) update users set x = 1"],
    ["explain update users set x = 1"],
    ["/* select */ update users set x = 1"],
    ["something_unknown users"],
  ])("writes: %s", (sql) => {
    expect(classifyStatement(sql)).toBe("write");
  });
});

describe("stripSqlNoise", () => {
  it("drops comments, literals and quoted identifiers, and lower-cases the rest", () => {
    expect(
      stripSqlNoise(`SELECT "Delete", 'Update' -- insert\n FROM t /* drop */`),
    ).not.toMatch(/delete|update|insert|drop/);
  });

  it("keeps a doubled quote inside a literal from ending it early", () => {
    expect(stripSqlNoise("select 'it''s; delete from users'")).not.toContain(
      "delete",
    );
  });
});
