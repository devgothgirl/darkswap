export function NearFiLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <a
      href="https://t.me/nearfi_bot?start=ref_ydy5qj9v"
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={onClick}
      aria-label="NearFi on Telegram (referral link, opens in a new tab)"
      title="NearFi on Telegram · referral link"
    >
      NearFi ↗
    </a>
  );
}