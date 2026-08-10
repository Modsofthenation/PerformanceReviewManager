import {
  roleDefinitions,
  roleExpectations,
  roleFrameworkVersions,
  roleFrameworks,
} from "@prm/db";
import { competencyKeysForTrack, DEFAULT_ROLE_FRAMEWORK } from "./defaultRoleFramework.js";
import { id, nowIso } from "./store.js";

type Db = ReturnType<typeof import("./store.js").getDb>;

/** Insert published PE default framework; returns version id + role key → definition id map. */
export function seedDefaultRoleFramework(
  db: Db,
  opts?: { ownerName?: string; createdAt?: string },
): { frameworkId: string; frameworkVersionId: string; roleIds: Record<string, string> } {
  const createdAt = opts?.createdAt ?? nowIso();
  const fwId = id("fw");
  const fwvId = id("fwv");
  db.insert(roleFrameworks)
    .values({ id: fwId, name: DEFAULT_ROLE_FRAMEWORK.name, createdAt })
    .run();
  db.insert(roleFrameworkVersions)
    .values({
      id: fwvId,
      frameworkId: fwId,
      versionLabel: DEFAULT_ROLE_FRAMEWORK.versionLabel,
      status: "published",
      publishedAt: createdAt,
      sourceFilename: DEFAULT_ROLE_FRAMEWORK.sourceFilename,
      ownerName: opts?.ownerName ?? "Default",
      effectiveFrom: createdAt.slice(0, 10),
      effectiveTo: null,
    })
    .run();

  const roleIds: Record<string, string> = {};
  for (const role of DEFAULT_ROLE_FRAMEWORK.roles) {
    const rid = id("role");
    roleIds[role.key] = rid;
    db.insert(roleDefinitions)
      .values({
        id: rid,
        frameworkVersionId: fwvId,
        key: role.key,
        title: role.title,
        track: role.track,
        levelKey: role.levelKey,
        summary: role.summary,
        nextRoleKeysJson: JSON.stringify(role.next),
        competencyKeysJson: JSON.stringify(competencyKeysForTrack(role.track)),
      })
      .run();
    role.expectations.forEach((exp, idx) => {
      db.insert(roleExpectations)
        .values({
          id: id("rexp"),
          roleDefinitionId: rid,
          kind: exp.kind,
          text: exp.text,
          sortOrder: idx,
        })
        .run();
    });
  }

  return { frameworkId: fwId, frameworkVersionId: fwvId, roleIds };
}
