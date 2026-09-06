import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isWithinScope,
  orderReferenceEntities,
  paginateReferenceEntities,
  referenceEntitiesFromBootstrap,
} from "../replica/reference-snapshot";
import { ReferenceEntityType, type ReferenceEntity } from "../replica/reference-types";

const SCOPE = { companyId: "co-1", branchId: "br-1", warehouseId: "wh-1" };

function entity(
  entityType: ReferenceEntity["entityType"],
  entityId: string,
  version = 1,
): ReferenceEntity {
  return { entityType, entityId, version, deleted: false, scope: SCOPE, payload: { entityId } };
}

test("ordering is by type priority then entityId (deterministic)", () => {
  const ordered = orderReferenceEntities([
    entity(ReferenceEntityType.product, "p2"),
    entity(ReferenceEntityType.category, "c1"),
    entity(ReferenceEntityType.product, "p1"),
    entity(ReferenceEntityType.storeContext, "current"),
  ]).map((e) => `${e.entityType}:${e.entityId}`);
  assert.deepEqual(ordered, [
    "store_context:current",
    "category:c1",
    "product:p1",
    "product:p2",
  ]);
});

test("pagination is resumable and reports completion", () => {
  const entities = [
    entity(ReferenceEntityType.category, "c1"),
    entity(ReferenceEntityType.product, "p1"),
    entity(ReferenceEntityType.product, "p2"),
  ];
  const page1 = paginateReferenceEntities(entities, 0, 2);
  assert.equal(page1.entities.length, 2);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.complete, false);
  assert.equal(page1.nextCursor, 2);

  const page2 = paginateReferenceEntities(entities, page1.nextCursor, 2);
  assert.equal(page2.entities.length, 1);
  assert.equal(page2.hasMore, false);
  assert.equal(page2.complete, true);
});

test("empty input yields an empty, complete page (never seeds)", () => {
  const page = paginateReferenceEntities([], 0, 100);
  assert.deepEqual(page.entities, []);
  assert.equal(page.complete, true);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, 0);
});

test("isWithinScope enforces tenant + branch", () => {
  assert.equal(isWithinScope(entity(ReferenceEntityType.product, "p1"), "co-1", ["br-1"]), true);
  assert.equal(isWithinScope(entity(ReferenceEntityType.product, "p1"), "co-2", ["br-1"]), false);
  assert.equal(isWithinScope(entity(ReferenceEntityType.product, "p1"), "co-1", ["br-9"]), false);
});

test("referenceEntitiesFromBootstrap attaches scope and deleted=false", () => {
  const mapped = referenceEntitiesFromBootstrap(
    [{ entityType: "product", entityId: "p1", version: 3, payload: { id: "p1" } }],
    SCOPE,
  );
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].scope.companyId, "co-1");
  assert.equal(mapped[0].deleted, false);
  assert.equal(mapped[0].version, 3);
});
