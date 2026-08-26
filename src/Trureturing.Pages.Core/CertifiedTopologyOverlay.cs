using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trureturing.Pages.Core;

public static class PagesTopologyOverlaySchemas
{
    public const string IntuitionOverlay = "pages-topology-intuition-overlay.v1";
}

public sealed record PagesTopologyIntuitionOverlay(
    [property: JsonRequired] string Schema,
    [property: JsonRequired] string SourceTruthReleaseDigest,
    [property: JsonRequired] string CertifiedTopologyDigest,
    [property: JsonRequired] IReadOnlyList<PagesCandidateRelation> Relations);

public static class PagesTopologyIntuitionOverlayJson
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        AllowTrailingCommas = false,
        ReadCommentHandling = JsonCommentHandling.Disallow,
        WriteIndented = true
    };

    public static PagesTopologyIntuitionOverlay Read(ReadOnlySpan<byte> bytes)
    {
        try
        {
            PagesTopologyIntuitionOverlay overlay =
                JsonSerializer.Deserialize<PagesTopologyIntuitionOverlay>(bytes, Options)
                ?? throw new InvalidDataException("Topology Intuition overlay is null.");
            Validate(overlay);
            return overlay;
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException(
                $"Topology Intuition overlay is invalid JSON: {exception.Message}",
                exception);
        }
    }

    public static PagesIntuitionOverlay Bind(
        PagesTopologyIntuitionOverlay overlay,
        PagesCertifiedTopology topology,
        ReadOnlySpan<byte> certifiedTopologyBytes)
    {
        Validate(overlay);
        PagesCertifiedTopologyJson.Validate(topology);

        string actualTopologyDigest = "sha256:" + Convert.ToHexString(
            SHA256.HashData(certifiedTopologyBytes)).ToLowerInvariant();

        if (!StringComparer.Ordinal.Equals(
                overlay.SourceTruthReleaseDigest,
                topology.SourceTruthReleaseDigest))
        {
            throw new InvalidDataException(
                "Intuition overlay is bound to a different truth release than the topology.");
        }

        if (!StringComparer.Ordinal.Equals(
                overlay.CertifiedTopologyDigest,
                actualTopologyDigest))
        {
            throw new InvalidDataException(
                "Intuition overlay is bound to different certified-topology bytes.");
        }

        PagesIntuitionOverlay pagesOverlay = new(
            PagesSchemas.IntuitionOverlay,
            overlay.SourceTruthReleaseDigest,
            overlay.Relations);
        PagesPortJson.Validate(pagesOverlay);
        return pagesOverlay;
    }

    public static byte[] Write(PagesTopologyIntuitionOverlay overlay)
    {
        Validate(overlay);
        return JsonSerializer.SerializeToUtf8Bytes(overlay, Options)
            .Concat(new byte[] { (byte)'\n' })
            .ToArray();
    }

    public static void Validate(PagesTopologyIntuitionOverlay overlay)
    {
        ArgumentNullException.ThrowIfNull(overlay);
        if (!StringComparer.Ordinal.Equals(
                overlay.Schema,
                PagesTopologyOverlaySchemas.IntuitionOverlay))
        {
            throw new InvalidDataException(
                $"schema must be {PagesTopologyOverlaySchemas.IntuitionOverlay}.");
        }

        RequireSha256(
            overlay.SourceTruthReleaseDigest,
            nameof(overlay.SourceTruthReleaseDigest));
        RequireSha256(
            overlay.CertifiedTopologyDigest,
            nameof(overlay.CertifiedTopologyDigest));

        _ = overlay.Relations
            ?? throw new InvalidDataException("relations must be an array.");

        PagesPortJson.Validate(new PagesIntuitionOverlay(
            PagesSchemas.IntuitionOverlay,
            overlay.SourceTruthReleaseDigest,
            overlay.Relations));
    }

    private static void RequireSha256(string value, string field)
    {
        if (value.Length != 71 ||
            !value.StartsWith("sha256:", StringComparison.Ordinal) ||
            !value["sha256:".Length..].All(character =>
                character is >= '0' and <= '9' or >= 'a' and <= 'f'))
        {
            throw new InvalidDataException(
                $"{field} must use sha256:<64hex>.");
        }
    }
}
