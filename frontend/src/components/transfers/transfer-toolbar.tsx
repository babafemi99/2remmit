import { MagnifyingGlass, SlidersHorizontal, X } from "@phosphor-icons/react";

import { TRANSFER_STATUSES, type TransferStatus } from "@/types/transfer";

type TransferToolbarProps = {
  query: string;
  status: string;
  onQueryChange: (query: string) => void;
  onStatusChange: (status: string) => void;
  onClear: () => void;
};

export function TransferToolbar({
  query,
  status,
  onQueryChange,
  onStatusChange,
  onClear,
}: TransferToolbarProps) {
  const active = Boolean(query || status !== "all");

  return (
    <div className="toolbar-block">
      <div className="toolbar" role="search">
        <label className="search-control">
          <span className="sr-only">Search by transfer reference</span>
          <MagnifyingGlass aria-hidden="true" size={19} weight="regular" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search by transfer reference"
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
            >
              <X aria-hidden="true" size={16} />
            </button>
          ) : null}
        </label>

        <label className="status-control">
          <span className="sr-only">Filter by transfer status</span>
          <SlidersHorizontal aria-hidden="true" size={19} weight="regular" />
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
          >
            <option value="all">All statuses</option>
            {TRANSFER_STATUSES.map((value: TransferStatus) => (
              <option key={value} value={value}>
                {value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className={`active-filter-row${active ? " is-visible" : ""}`}
        aria-hidden={!active}
      >
        {active ? (
          <button type="button" className="clear-filters" onClick={onClear}>
            <X aria-hidden="true" size={14} />
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
