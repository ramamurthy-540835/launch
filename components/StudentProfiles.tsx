"use client";

import { useCallback, useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebase-client";

export type StudentSelection = { id: string; studentName: string };
type StudentDocument = {
  id: string;
  student_name: string;
  school_id: string;
  grade_band: string;
  allergies: string[];
};

export default function StudentProfiles({ schoolId, gradeBand, onChange }: { schoolId: string; gradeBand: string; onChange: (student: StudentSelection | null) => void }) {
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadStudents = useCallback(async () => {
    const token = await firebaseAuth()?.currentUser?.getIdToken();
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/students", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load student profiles.");
      setStudents(data.students);
      const match = data.students.find((student: StudentDocument) => student.school_id === schoolId && student.grade_band === gradeBand);
      onChange(match ? { id: match.id, studentName: match.student_name } : null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load student profiles.");
    } finally {
      setLoading(false);
    }
  }, [gradeBand, onChange, schoolId]);

  useEffect(() => { void loadStudents(); }, [loadStudents]);

  async function createStudent(form: FormData) {
    const token = await firebaseAuth()?.currentUser?.getIdToken();
    const allergies = String(form.get("allergies") || "").split(",");
    const response = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        studentName: form.get("profileStudentName"),
        schoolId,
        gradeBand,
        allergies,
        allergyAcknowledged: form.get("allergyAcknowledged") === "on",
      }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to save student profile.");
    const student = { id: data.id, student_name: data.studentName, school_id: schoolId, grade_band: gradeBand, allergies: data.allergies };
    setStudents((current) => [...current, student]);
    onChange({ id: data.id, studentName: data.studentName });
    setMessage("Student profile saved.");
  }

  const eligible = students.filter((student) => student.school_id === schoolId && student.grade_band === gradeBand);
  if (loading) return <small>Loading student profiles…</small>;

  return <div>
    {eligible.length > 0 && <label>Student profile<select defaultValue="" onChange={(event) => {
      const student = eligible.find((item) => item.id === event.target.value);
      onChange(student ? { id: student.id, studentName: student.student_name } : null);
    }}><option value="" disabled>Select student</option>{eligible.map((student) => <option value={student.id} key={student.id}>{student.student_name}</option>)}</select></label>}
    <label>New student name<input name="profileStudentName" minLength={2} placeholder="e.g. Nila Raman" /></label>
    <label>Known allergies<input name="allergies" placeholder="e.g. peanut, milk — or leave blank" /></label>
    <label><input name="allergyAcknowledged" type="checkbox" /> I confirm the allergy information is complete and will notify the school and kitchen of changes.</label>
    <button type="button" onClick={(event) => void createStudent(new FormData(event.currentTarget.form!))}>Save student profile</button>
    {message && <small role="status">{message}</small>}
  </div>;
}
