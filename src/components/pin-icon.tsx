/** The Map tab icon: a solid red map pin with a round hole (drawn to match the sketch). */
export function PinIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size * 0.75}
      height={size}
      viewBox="0 0 24 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path
        fillRule="evenodd"
        fill="#FF385C"
        d="M12 0C5.37 0 0 5.2 0 11.6 0 20.3 12 32 12 32s12-11.7 12-20.4C24 5.2 18.63 0 12 0Zm0 6.8a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Z"
      />
    </svg>
  );
}
