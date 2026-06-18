"use client";

import { useCallback, useEffect, type MouseEvent } from "react";

interface UseModalDismissOptions {
  open: boolean;
  dirty?: boolean;
  disabled?: boolean;
  onClose: () => void;
  confirmMessage?: string;
}

export function useModalDismiss({
  open,
  dirty = false,
  disabled = false,
  onClose,
  confirmMessage = "有未保存的修改，确定关闭吗？",
}: UseModalDismissOptions) {
  const requestClose = useCallback(() => {
    if (disabled) {
      return;
    }
    if (dirty && !window.confirm(confirmMessage)) {
      return;
    }
    onClose();
  }, [confirmMessage, dirty, disabled, onClose]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, requestClose]);

  const backdropProps = {
    onMouseDown: (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        requestClose();
      }
    },
  };

  return { requestClose, backdropProps };
}
