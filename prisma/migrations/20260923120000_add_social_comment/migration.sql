-- CreateTable
CREATE TABLE "SocialComment" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformCommentId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "text" TEXT NOT NULL,
    "likeCount" INTEGER,
    "replyCount" INTEGER,
    "authorUsername" TEXT,
    "publishedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "sentiment" TEXT,
    "category" TEXT,
    "rawMetadata" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialComment_platform_platformCommentId_key" ON "SocialComment"("platform", "platformCommentId");
CREATE INDEX "SocialComment_postId_idx" ON "SocialComment"("postId");
CREATE INDEX "SocialComment_publishedAt_idx" ON "SocialComment"("publishedAt");
CREATE INDEX "SocialComment_sentiment_idx" ON "SocialComment"("sentiment");

-- AddForeignKey
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
