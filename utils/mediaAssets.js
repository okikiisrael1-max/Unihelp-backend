const RESOURCE_TYPES = new Set(["image", "video", "raw"]);

const inferResourceType = (value = {}) => {
  const explicit =
    value.resourceType ||
    value.resource_type ||
    value.cloudinaryResourceType ||
    value.cloudinary_resource_type;

  if (RESOURCE_TYPES.has(explicit)) return explicit;

  const type = value.type || value.mimeType || "";
  if (typeof type === "string") {
    if (type.startsWith("video/") || type === "video") return "video";
    if (type.startsWith("image/") || type === "image") return "image";
    if (type === "pdf" || type === "document" || type === "raw") return "raw";
  }

  return "image";
};

const assetFromObject = (value) => {
  if (!value || typeof value !== "object") return null;

  const publicId =
    value.publicId ||
    value.public_id ||
    value.cloudinaryPublicId ||
    value.cloudinary_public_id;

  if (!publicId) return null;

  return {
    url: value.url || value.secure_url || value.fileUrl || "",
    publicId,
    resourceType: inferResourceType(value),
  };
};

const collectAssetsFromString = (value = "", assets = []) => {
  if (!value || typeof value !== "string" || !value.includes("res.cloudinary.com")) {
    return assets;
  }

  const matches = value.match(/https?:\/\/res\.cloudinary\.com\/[^\s)"']+/g) || [];
  matches.forEach((url) => {
    const resourceMatch = url.match(/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\//);
    assets.push({
      url,
      publicId: null,
      resourceType: resourceMatch?.[1] || "image",
    });
  });

  return assets;
};

export const collectCloudinaryAssets = (value, assets = []) => {
  if (!value) return assets;

  if (Array.isArray(value)) {
    value.forEach((item) => collectCloudinaryAssets(item, assets));
    return assets;
  }

  if (typeof value === "string") {
    collectAssetsFromString(value, assets);
    return assets;
  }

  if (typeof value !== "object") return assets;

  const directAsset = assetFromObject(value);
  if (directAsset) assets.push(directAsset);

  if (value.cloudinaryPublicId) {
    assets.push({
      url: value.fileUrl || value.url || value.downloadUrl || value.previewUrl || "",
      publicId: value.cloudinaryPublicId,
      resourceType: value.cloudinaryResourceType || "image",
    });
  }

  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") {
      collectCloudinaryAssets(nested, assets);
    }
  }

  return assets;
};

export const normalizeUploadedAsset = (result, fallback = {}) => ({
  url: result?.secure_url || result?.url || fallback.url || "",
  publicId: result?.public_id || result?.publicId || fallback.publicId || "",
  resourceType: result?.resource_type || result?.resourceType || fallback.resourceType || "image",
});
