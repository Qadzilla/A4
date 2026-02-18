import { useState } from 'react';
import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from '@a4/ui';
import { useMutation } from '@tanstack/react-query';
import {
  generatePassphrase,
  generateSalt,
  deriveKey,
  encryptVerification,
  setCachedKey,
} from '../../lib/vault-crypto';
import { useTRPC } from '../../lib/trpc';

interface VaultSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetupComplete: () => void;
}

export function VaultSetupModal({ open, onOpenChange, onSetupComplete }: VaultSetupModalProps) {
  const [passphrase, setPassphrase] = useState(() => generatePassphrase());
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trpc = useTRPC();
  const setupMutation = useMutation(trpc.vault.setup.mutationOptions());

  const regenerate = () => {
    setPassphrase(generatePassphrase());
    setError(null);
  };

  const handleSetup = async () => {
    setIsSettingUp(true);
    setError(null);
    try {
      const salt = generateSalt();
      const key = await deriveKey(passphrase, salt);
      const { ciphertext, iv } = await encryptVerification(key);

      await setupMutation.mutateAsync({
        salt,
        verificationCiphertext: ciphertext,
        verificationIV: iv,
      });

      setCachedKey(key);
      onSetupComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up vault');
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Set Up Vault</ModalTitle>
        </ModalHeader>

        <div className="space-y-4 py-2">
          <p className="text-[13px] text-muted-foreground">
            Your vault passphrase encrypts sensitive data on this device before it reaches the server.
            The server never sees your passphrase or encryption key.
          </p>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Your passphrase
            </p>
            <p className="text-lg font-mono font-semibold text-foreground tracking-wide select-all">
              {passphrase}
            </p>
          </div>

          <button
            type="button"
            onClick={regenerate}
            className="text-[13px] text-primary hover:underline"
          >
            Regenerate
          </button>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-[12px] text-amber-600 dark:text-amber-400">
              Write this down. If you forget it, encrypted data cannot be recovered.
            </p>
          </div>

          {error && (
            <p className="text-[12px] text-destructive">{error}</p>
          )}
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSettingUp}>
            Cancel
          </Button>
          <Button onClick={handleSetup} disabled={isSettingUp}>
            {isSettingUp ? 'Setting up...' : 'Set up vault'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
