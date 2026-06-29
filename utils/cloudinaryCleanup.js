import { v2 as cloudinary } from "cloudinary";

const VALID_RESOURCE_TYPES = new Set(["image", "video", "raw"]);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const isCloudinaryAdminConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

export const normalizeResourceType = (resourceType) => {
  if (VALID_RESOURCE_TYPES.has(resourceType)) return resourceType;
  return "image";
};

export const deleteCloudinaryAsset = async ({ publicId, resourceType }) => {
  if (!publicId) {
    console.log("[cloudinary] Skipping asset because publicId is missing.");
    return { skipped: true, reason: "missing_public_id" };
  }

  if (!isCloudinaryAdminConfigured()) {
    console.log("[cloudinary] Skipping asset because Admin API credentials are not configured.");
    return { skipped: true, reason: "missing_cloudinary_config", publicId };
  }

  const type = normalizeResourceType(resourceType);

  try {
    console.log(`[cloudinary] Deleting Cloudinary asset: ${publicId} (${type})`);
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: type,
      invalidate: true,
    });
    console.log(`[cloudinary] Deleted successfully: ${publicId}`, result);
    return { success: true, publicId, resourceType: type, result };
  } catch (error) {
    console.error(`[cloudinary] Cloudinary deletion failed: ${publicId}`, error);
    return {
      success: false,
      publicId,
      resourceType: type,
      error: error.message || "Cloudinary deletion failed",
    };
  }
};

export const deleteCloudinaryAssets = async (assets = []) => {
  const unique = [];
  const seen = new Set();

  for (const asset of assets) {
    if (!asset?.publicId) {
      unique.push(asset);
      continue;
    }

    const key = `${asset.resourceType || "image"}:${asset.publicId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(asset);
  }

  const results = [];

  for (const asset of unique) {
    results.push(await deleteCloudinaryAsset(asset));
  }

  return results;
};
