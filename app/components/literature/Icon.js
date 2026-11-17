const paths = {
  book: <><path d="M5 4h13v16H5zM8 4v16" /></>,
  booklet: <><path d="M4 5c3-1 6 0 8 2v13c-2-2-5-3-8-2zM20 5c-3-1-6 0-8 2v13c2-2 5-3 8-2z" /></>,
  tract: <><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5" /></>,
  magazine: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M7 7h10M7 10h4v6H7zM14 11h3M14 14h3" /></>,
  workbook: <><rect x="5" y="4" width="15" height="17" rx="1" /><path d="M9 4v17M3 7h4M3 11h4M3 15h4" /></>,
  bible: <><path d="M5 4h14v16H5zM8 4v16M13 8v7M11 10h4" /></>,
  toolbox: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M9 8V5h6v3M3 13h18M10 13v2h4v-2" /></>,
  other: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 15h6" /></>,
  note: <><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5" /></>,
  grid: <><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><rect x="14" y="14" width="6" height="6" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h1M4 12h1M4 18h1" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  check: <path d="M5 12l5 5L19 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 18l-6-6 6-6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
};

export default function Icon({ name, className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
