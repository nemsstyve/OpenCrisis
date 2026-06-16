import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Classe utilitaire pour ajuster la largeur (ex. "sm:max-w-lg"). Défaut : sm:max-w-md. */
  contentClassName?: string;
  children: React.ReactNode;
}

/**
 * Wrapper de modale de formulaire basé sur le Dialog shadcn/Radix.
 * Gère nativement la fermeture au clic extérieur, à la touche Échap et le focus-trap,
 * tout en conservant le style sombre de l'application. Le bouton de fermeture (croix)
 * est fourni par DialogContent.
 */
export function FormModal({ open, onClose, title, contentClassName, children }: FormModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className={`bg-[#13151a] border-[#1e2229] text-white p-0 gap-0 max-h-[90vh] overflow-y-auto ${
          contentClassName ?? "sm:max-w-md"
        }`}
      >
        <DialogHeader className="px-6 py-4 border-b border-[#1e2229] text-left">
          <DialogTitle className="text-white font-medium">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
