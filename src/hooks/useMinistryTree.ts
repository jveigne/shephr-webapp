import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildTree } from "@/lib/orgTree";
import { fetchMinistryStructure } from "@/services/orgService";

/** Arbre du ministère (racine MINISTRY = id du ministère), partagé avec la page Structure via la clé de cache. */
export function useMinistryTree(ministryId: string, ministryName: string) {
  const structureQ = useQuery({
    queryKey: ["ministry-structure", ministryId],
    queryFn: () => fetchMinistryStructure(ministryId),
    enabled: !!ministryId,
  });
  const tree = useMemo(
    () => (structureQ.data && ministryId ? buildTree(structureQ.data, ministryId, ministryName) : null),
    [structureQ.data, ministryId, ministryName],
  );
  return { tree, isLoading: structureQ.isLoading && !!ministryId, isError: structureQ.isError, error: structureQ.error };
}
