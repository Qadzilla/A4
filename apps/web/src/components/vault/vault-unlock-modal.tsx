import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTRPC } from '../../lib/trpc';
import { deriveKey, setCachedKey, verifyKey } from '../../lib/vault-crypto';

interface VaultUnlockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlockComplete: () => void;
}

export function VaultUnlockModal({ open, onOpenChange, onUnlockComplete }: VaultUnlockModalProps) {
  const [passphrase, setPassphrase] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trpc = useTRPC();
  const { data: vaultConfig, isLoading: isConfigLoading } = useQuery(
    trpc.vault.getConfig.queryOptions(),
  );

  const handleUnlock = async () => {
    if (!vaultConfig) return;
    setIsUnlocking(true);
    setError(null);
    try {
      const key = await deriveKey(passphrase.trim(), vaultConfig.salt);
      const valid = await verifyKey(
        key,
        vaultConfig.verificationCiphertext,
        vaultConfig.verificationIV,
      );

      if (!valid) {
        setError('Wrong passphrase. Please try again.');
        return;
      }

      setCachedKey(key);
      onUnlockComplete();
    } catch {
      setError('Failed to unlock vault. Please try again.');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Unlock Vault</ModalTitle>
        </ModalHeader>

        <div className="space-y-4 py-2">
          {isConfigLoading ? (
            <p className="text-[13px] text-muted-foreground">Loading vault configuration...</p>
          ) : (
            <>
              <p className="text-[13px] text-muted-foreground">
                Enter your 3-word passphrase to decrypt sensitive data.
              </p>

              <input
                type="text"
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && passphrase.trim()) handleUnlock();
                }}
                placeholder="e.g. blue fish monday"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[14px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
              />

              {error && <p className="text-[12px] text-destructive">{error}</p>}
            </>
          )}
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUnlocking}>
            Cancel
          </Button>
          <Button
            onClick={handleUnlock}
            disabled={isUnlocking || isConfigLoading || !passphrase.trim()}
          >
            {isUnlocking ? 'Unlocking...' : 'Unlock'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
