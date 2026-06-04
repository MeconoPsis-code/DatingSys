"use client";

import { ConfirmModal } from "@/components/ui/confirm-modal";

interface ClearModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

const CONFIRM_TEXT = "确认清空我的资料";

export function ClearModal({ open, onClose, onConfirm, loading }: ClearModalProps) {
  return (
    <ConfirmModal
      open={open}
      title="清空资料"
      description="清空资料后，你的个人信息将从匹配池中移除，其他用户将无法看到你的资料。此操作不会删除你的账号，但清空后 30 天内无法重新发布资料。"
      confirmText={CONFIRM_TEXT}
      buttonLabel="确认清空"
      variant="danger"
      loading={loading}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
