import { useEffect, useRef, type ReactNode } from "react";
export default function ConfirmDialog({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      onCancel={onClose}
      aria-labelledby="confirm-title"
    >
      {children}
    </dialog>
  );
}
