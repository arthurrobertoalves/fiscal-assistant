-- CreateTable
CREATE TABLE "FileBlob" (
    "storageKey" VARCHAR(255) NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileBlob_pkey" PRIMARY KEY ("storageKey")
);
