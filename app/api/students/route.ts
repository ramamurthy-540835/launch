import { FieldValue } from "@google-cloud/firestore";
import { NextResponse } from "next/server";
import { ParentAuthError, verifyParent } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { gradeAdjustments, schools } from "@/lib/meals";
import { enforceRateLimit, RateLimitError } from "@/lib/hardening";

export const runtime = "nodejs";

type IncomingStudent = {
  studentName?: unknown;
  schoolId?: unknown;
  gradeBand?: unknown;
  allergies?: unknown;
  allergyAcknowledged?: unknown;
};

function unauthorized(error: unknown) {
  const status = error instanceof RateLimitError ? 429 : error instanceof ParentAuthError ? 401 : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to manage student profiles." }, { status });
}

export async function GET(request: Request) {
  try {
    const parent = await verifyParent(request);
    if (!parent) throw new ParentAuthError("Parent sign-in is required.");
    await enforceRateLimit("list_students", parent.uid, 60, 60);
    const snapshot = await firestoreClient().collection("students").where("parent_uid", "==", parent.uid).get();
    const students = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    return NextResponse.json({ students });
  } catch (error) {
    return unauthorized(error);
  }
}

export async function POST(request: Request) {
  try {
    const parent = await verifyParent(request);
    if (!parent) throw new ParentAuthError("Parent sign-in is required.");
    await enforceRateLimit("create_student", parent.uid, 10, 3600);
    const body = (await request.json()) as IncomingStudent;
    const studentName = typeof body.studentName === "string" ? body.studentName.trim() : "";
    const schoolId = typeof body.schoolId === "string" ? body.schoolId : "";
    const gradeBand = typeof body.gradeBand === "string" ? body.gradeBand : "";
    const allergies = Array.isArray(body.allergies)
      ? body.allergies.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20)
      : [];

    if (studentName.length < 2 || studentName.length > 100 || !schools.some((school) => school.id === schoolId) || !(gradeBand in gradeAdjustments)) {
      return NextResponse.json({ error: "Enter a valid student name, school and grade." }, { status: 400 });
    }
    if (body.allergyAcknowledged !== true) {
      return NextResponse.json({ error: "Parent allergy acknowledgement is required." }, { status: 400 });
    }

    const reference = firestoreClient().collection("students").doc();
    await reference.create({
      parent_uid: parent.uid,
      student_name: studentName,
      school_id: schoolId,
      grade_band: gradeBand,
      allergies,
      allergy_acknowledged: true,
      allergy_acknowledged_at: FieldValue.serverTimestamp(),
      active: true,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ id: reference.id, studentName, schoolId, gradeBand, allergies }, { status: 201 });
  } catch (error) {
    return unauthorized(error);
  }
}
