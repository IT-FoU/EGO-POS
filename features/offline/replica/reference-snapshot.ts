/**
 * Reference snapshot assembly (Phase 5) — pure helpers.
 *
 * Deterministically orders reference entities and paginates them for the Phase 4
 * bootstrap contract. Kept pure (no Prisma/DB) so ordering + pagination are
 * unit-testable and identical on server and client.
 */

import {
  REFERENCE_TYPE_ORDER,
  type ReferenceEntity,
  type ReferenceEntityTypeValue,
  type ReferenceScope,
} from "./reference-types";

function typeRank(type: ReferenceEntityTypeValue): number {
  const index = REFERENCE_TYPE_ORDER.indexOf(type);
  return index === -1 ? REFERENCE_TYPE_ORDER.length : index;
}

/**
 * Stable ordering: by reference-type priority, then entityId. This makes
 * bootstrap pagination resumable and reproducible.
 */
export function orderReferenceEntities<T extends ReferenceEntity>(entities: T[]): T[] {
  return [...entities].sort((a, b) => {
    const ra = typeRank(a.entityType);
    const rb = typeRank(b.entityType);
    if (ra !== rb) return ra - rb;
    if (a.entityId !== b.entityId) return a.entityId < b.entityId ? -1 : 1;
    return 0;
  });
}

export interface ReferencePage<T extends ReferenceEntity = ReferenceEntity> {
  entities: T[];
  nextCursor: number;
  hasMore: boolean;
  complete: boolean;
}

/**
 * Offset-cursor pagination over a stably-ordered entity list. Empty input yields
 * an empty, complete page — callers never seed defaults from an empty result.
 */
export function paginateReferenceEntities<T extends ReferenceEntity>(
  entities: T[],
  cursor: number,
  limit: number,
): ReferencePage<T> {
  const ordered = orderReferenceEntities(entities);
  const start = Math.max(0, cursor);
  const size = Math.max(1, limit);
  const page = ordered.slice(start, start + size);
  const nextCursor = start + page.length;
  const hasMore = nextCursor < ordered.length;
  return { entities: page, nextCursor, hasMore, complete: !hasMore };
}

/** Assert an entity is within the expected tenant/branch scope (isolation). */
export function isWithinScope(
  entity: Pick<ReferenceEntity, "scope">,
  companyId: string,
  branchIds: string[],
): boolean {
  if (entity.scope.companyId !== companyId) return false;
  if (entity.scope.branchId && !branchIds.includes(entity.scope.branchId)) return false;
  return true;
}

/**
 * Client helper: map a bootstrap response's (scope-less) entities into scoped
 * {@link ReferenceEntity} records using the device's known namespace scope.
 * Bootstrap only carries live entities, so `deleted` is always false.
 */
export function referenceEntitiesFromBootstrap(
  entities: Array<{ entityType: string; entityId: string; version: number; payload: unknown }>,
  scope: ReferenceScope,
): ReferenceEntity[] {
  return entities.map((entity) => ({
    entityType: entity.entityType as ReferenceEntityTypeValue,
    entityId: entity.entityId,
    version: entity.version,
    deleted: false,
    scope,
    payload: entity.payload,
  }));
}
