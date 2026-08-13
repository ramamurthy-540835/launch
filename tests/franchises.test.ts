import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const list = vi.fn(); const detail = vi.fn(); const limit = vi.fn(() => ({ get: list }));
  const where = vi.fn(() => ({ limit })); const doc = vi.fn(() => ({ get: detail })); const collection = vi.fn(() => ({ where, doc }));
  return { list, detail, limit, where, doc, collection };
});
vi.mock("@/lib/firestore", () => ({ firestoreClient: () => ({ collection: mocks.collection }) }));
import { getFranchise, getFranchises } from "@/lib/franchises";
const row = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });
describe("active LunchBox franchise directory", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue({ docs: [] }); mocks.detail.mockResolvedValue({ exists: false }); });
  it("queries only verified ACTIVE Firestore operators", async () => {
    mocks.list.mockResolvedValue({ docs: [row("LBX-123", { status: "ACTIVE", name: "LunchBox Adyar", company_name: "Adyar Foods", student_count: 12 })] });
    const result = await getFranchises();
    expect(mocks.where).toHaveBeenCalledWith("status", "==", "ACTIVE");
    expect(result).toMatchObject({ source: "firestore", franchises: [{ id: "LBX-123", name: "LunchBox Adyar", companyName: "Adyar Foods", studentCount: 12 }] });
  });
  it("does not surface scraped or fallback lead data when there are no active operators", async () => {
    await expect(getFranchises()).resolves.toEqual({ franchises: [], source: "firestore" });
  });
  it("returns details only for ACTIVE operators", async () => {
    mocks.detail.mockResolvedValue({ exists: true, get: () => "INACTIVE", id: "lead", data: () => ({ name: "Public lead" }) });
    await expect(getFranchise("lead")).resolves.toBeNull();
    mocks.detail.mockResolvedValue({ exists: true, get: () => "ACTIVE", id: "LBX-1", data: () => ({ name: "Active partner" }) });
    await expect(getFranchise("LBX-1")).resolves.toMatchObject({ name: "Active partner" });
  });
});
