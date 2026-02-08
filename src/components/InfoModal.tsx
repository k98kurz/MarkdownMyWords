import { Modal } from './ui/Modal';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InfoModal({ isOpen, onClose }: InfoModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl">
      <div className="p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-card-foreground">
            Important Information
          </h2>
        </div>

        <div className="space-y-4">
          <div className="rounded-md bg-rose-500/10 p-3 border border-rose-500/20">
            <h3 className="font-semibold text-rose-500 mb-1">
              ⚠️ Security Warning
            </h3>
            <p className="text-card-foreground/90">
              Your account cannot be recovered and your password cannot be
              reset. There is no central server to retrieve your credentials. If
              you forget your password, you will lose access to your account and
              all your data.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-card-foreground mb-1">
              About GunDB
            </h3>
            <p className="text-card-foreground/80">
              GunDB is a decentralized database that stores your data in the
              browser and syncs peer-to-peer. Your data lives locally and is
              synchronized through relays.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-card-foreground mb-1">
              About SEA
            </h3>
            <p className="text-card-foreground/80">
              SEA (Security, Encryption, Authorization) is GunDB's encryption
              library. It secures your data with cryptographic keys derived from
              your password (documents have their own encryption keys which are
              encrypted with your password before being saved to your data). Your
              documents are encrypted locally and only you (or those you share
              with) can decrypt them.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}
