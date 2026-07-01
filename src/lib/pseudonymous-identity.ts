export interface DisplayIdentity {
  name: string;
  letter: string;
  color: string;
}

const AVATAR_COLORS = [
  "from-[#1677ff] to-[#0958d9]",
  "from-[hsl(200,80%,55%)] to-[hsl(220,70%,50%)]",
  "from-[hsl(340,80%,55%)] to-[hsl(10,70%,50%)]",
  "from-[hsl(150,60%,45%)] to-[hsl(170,70%,40%)]",
  "from-[hsl(30,85%,55%)] to-[hsl(50,75%,50%)]",
];

const MASKED_AVATAR_COLORS = [
  "from-[#1677ff] to-[#0958d9]",
  "from-[#14b8a6] to-[#0f766e]",
  "from-[#f97316] to-[#ea580c]",
  "from-[#a855f7] to-[#7e22ce]",
  "from-[#ef4444] to-[#b91c1c]",
  "from-[#22c55e] to-[#15803d]",
  "from-[#06b6d4] to-[#0369a1]",
  "from-[#64748b] to-[#334155]",
];

const MASKED_NAMES = [
  "\u9752\u5c9a",
  "\u661f\u6cb3",
  "\u4e91\u8212",
  "\u6674\u5ddd",
  "\u5b89\u6f9c",
  "\u6e05\u548c",
  "\u671b\u8212",
  "\u77e5\u8fdc",
  "\u660e\u6f88",
  "\u521d\u6674",
  "\u4e91\u8d77",
  "\u4e34\u5ddd",
  "\u542c\u6f9c",
  "\u5357\u661f",
  "\u5317\u8fb0",
  "\u9526\u5e74",
];

const MASKED_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

export function getInitial(nickname: string | null | undefined): string {
  const trimmed = nickname?.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

export function getAvatarColor(userId: string): string {
  const hash = hashString(userId);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getMaskedIdentity(userId: string): DisplayIdentity {
  const hash = hashString(userId);
  const shiftedHash = hashString(`${userId}:masked`);
  return {
    name: MASKED_NAMES[hash % MASKED_NAMES.length],
    letter: MASKED_LETTERS[shiftedHash % MASKED_LETTERS.length],
    color: MASKED_AVATAR_COLORS[shiftedHash % MASKED_AVATAR_COLORS.length],
  };
}
