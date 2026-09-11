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
    // showModal() enfoca el primer elemento focusable; si está abajo (p. ej. el
    // desplegable del prompt de ciudad), desplaza el scroll. Lo devolvemos arriba.
    const frame = requestAnimationFrame(() => {
      dialog.scrollTop = 0;
    });
    return () => {
      cancelAnimationFrame(frame);
      dialog.close();
    };
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
