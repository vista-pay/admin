"use client";

import { useCallback, useState } from "react";

export function usePagination(initialPage = 1, initialLimit = 20) {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);

  const next = useCallback(() => setPage((p) => p + 1), []);
  const prev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const goTo = useCallback((p: number) => setPage(Math.max(1, p)), []);
  const reset = useCallback(() => setPage(1), []);

  return { page, limit, setPage, setLimit, next, prev, goTo, reset };
}
