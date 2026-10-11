import { readApiJson } from "@/lib/api-client";

export interface NicknameEditSnapshot {
  nickname: string;
  nicknameRevision: number;
}

export async function loadNicknameEditSnapshot(): Promise<NicknameEditSnapshot> {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  const payload = await readApiJson<{ data: {
    nickname: string | null;
    nicknameRevision?: number;
    groupCardSync?: { nicknameRevision: number };
  } }>(response, "无法加载当前昵称，请刷新后重试");
  const nicknameRevision = payload.data.nicknameRevision ?? payload.data.groupCardSync?.nicknameRevision;
  if (typeof nicknameRevision !== "number") throw new Error("无法确认当前昵称版本，请刷新后重试。");
  return { nickname: payload.data.nickname ?? "", nicknameRevision };
}

export async function readNicknameEditConflict(response: Response): Promise<NicknameEditSnapshot | null> {
  if (response.status !== 409) return null;
  const payload = await response.clone().json().catch(() => null);
  const error = payload?.error;
  if (error?.code !== "NICKNAME_CONFLICT" || typeof error.currentNickname !== "string" || typeof error.currentRevision !== "number") return null;
  return { nickname: error.currentNickname, nicknameRevision: error.currentRevision };
}
