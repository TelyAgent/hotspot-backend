-- CreateTable
CREATE TABLE "kol_radar_snapshots" (
    "id" TEXT NOT NULL,
    "collectionRunId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kol_radar_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kol_radar_snapshot_items" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "handle" TEXT NOT NULL,
    "authorName" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TEXT,
    "postType" TEXT,
    "url" TEXT,
    "metrics" JSONB,
    "signalId" TEXT,
    "rawItemId" TEXT,
    "sourceItemId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kol_radar_snapshot_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kol_radar_snapshots_collectionRunId_key" ON "kol_radar_snapshots"("collectionRunId");
CREATE INDEX "kol_radar_snapshots_observedAt_idx" ON "kol_radar_snapshots"("observedAt");
CREATE UNIQUE INDEX "kol_radar_snapshot_items_snapshotId_handle_key" ON "kol_radar_snapshot_items"("snapshotId", "handle");
CREATE INDEX "kol_radar_snapshot_items_handle_rank_idx" ON "kol_radar_snapshot_items"("handle", "rank");

-- AddForeignKey
ALTER TABLE "kol_radar_snapshots"
  ADD CONSTRAINT "kol_radar_snapshots_collectionRunId_fkey"
  FOREIGN KEY ("collectionRunId") REFERENCES "collection_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kol_radar_snapshot_items"
  ADD CONSTRAINT "kol_radar_snapshot_items_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "kol_radar_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
