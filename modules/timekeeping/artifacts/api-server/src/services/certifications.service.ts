import { db, certificationsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { computeCertStatus } from "../lib/timekeeping";
import type { Certification, InsertCertification } from "@workspace/db";

export type CertificationWithStatus = Certification & {
  status: "active" | "expiring_soon" | "expired";
};

function withStatus(cert: Certification): CertificationWithStatus {
  return { ...cert, status: computeCertStatus(cert.expiresDate) };
}

export async function listCertifications(filters?: {
  employeeId?: number;
  status?: string;
}): Promise<CertificationWithStatus[]> {
  let rows = await db
    .select()
    .from(certificationsTable)
    .orderBy(asc(certificationsTable.name));

  if (filters?.employeeId != null) {
    rows = rows.filter((c) => c.employeeId === filters.employeeId);
  }

  let result = rows.map(withStatus);

  if (filters?.status) {
    result = result.filter((c) => c.status === filters.status);
  }

  return result;
}

export async function getCertification(
  id: number
): Promise<CertificationWithStatus | null> {
  const [row] = await db
    .select()
    .from(certificationsTable)
    .where(eq(certificationsTable.id, id));
  return row ? withStatus(row) : null;
}

export async function createCertification(
  data: InsertCertification
): Promise<CertificationWithStatus> {
  const [row] = await db.insert(certificationsTable).values(data).returning();
  return withStatus(row!);
}

export async function updateCertification(
  id: number,
  data: Partial<InsertCertification>
): Promise<CertificationWithStatus | null> {
  const [row] = await db
    .update(certificationsTable)
    .set(data)
    .where(eq(certificationsTable.id, id))
    .returning();
  return row ? withStatus(row) : null;
}

export async function deleteCertification(
  id: number
): Promise<Certification | null> {
  const [row] = await db
    .delete(certificationsTable)
    .where(eq(certificationsTable.id, id))
    .returning();
  return row ?? null;
}

export async function getExpiringCertifications(
  withinDays: number = 30
): Promise<CertificationWithStatus[]> {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  const rows = await db.select().from(certificationsTable);
  return rows
    .filter((c) => {
      if (!c.expiresDate) return false;
      const exp = new Date(c.expiresDate);
      return exp >= now && exp <= cutoff;
    })
    .map((c) => ({ ...withStatus(c), status: "expiring_soon" as const }));
}
