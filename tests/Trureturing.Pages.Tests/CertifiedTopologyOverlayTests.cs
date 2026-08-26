using System.Security.Cryptography;
using Trureturing.Pages.Core;
using Xunit;

namespace Trureturing.Pages.Tests;

public sealed class CertifiedTopologyOverlayTests
{
    [Fact]
    public void ExactTopologyBytesAndTruthReleaseAreAccepted()
    {
        PagesCertifiedTopology topology = EmptyTopology();
        byte[] topologyBytes = PagesCertifiedTopologyJson.Write(topology);
        PagesTopologyIntuitionOverlay overlay = new(
            PagesTopologyOverlaySchemas.IntuitionOverlay,
            topology.SourceTruthReleaseDigest,
            Digest(topologyBytes),
            []);

        PagesTopologyIntuitionOverlay roundTrip =
            PagesTopologyIntuitionOverlayJson.Read(
                PagesTopologyIntuitionOverlayJson.Write(overlay));
        PagesIntuitionOverlay pagesOverlay =
            PagesTopologyIntuitionOverlayJson.Bind(
                roundTrip,
                topology,
                topologyBytes);

        Assert.Equal(PagesSchemas.IntuitionOverlay, pagesOverlay.Schema);
        Assert.Equal(topology.SourceTruthReleaseDigest,
            pagesOverlay.SourceTruthReleaseDigest);
        Assert.Empty(pagesOverlay.Relations);
    }

    [Fact]
    public void SameTruthReleaseWithDifferentTopologyBytesIsRejected()
    {
        PagesCertifiedTopology topology = EmptyTopology();
        byte[] topologyBytes = PagesCertifiedTopologyJson.Write(topology);
        PagesTopologyIntuitionOverlay overlay = new(
            PagesTopologyOverlaySchemas.IntuitionOverlay,
            topology.SourceTruthReleaseDigest,
            Sha('f'),
            []);

        InvalidDataException error = Assert.Throws<InvalidDataException>(
            () => PagesTopologyIntuitionOverlayJson.Bind(
                overlay,
                topology,
                topologyBytes));

        Assert.Contains("different certified-topology bytes", error.Message);
    }

    [Fact]
    public void DifferentTruthReleaseIsRejectedBeforeProjection()
    {
        PagesCertifiedTopology topology = EmptyTopology();
        byte[] topologyBytes = PagesCertifiedTopologyJson.Write(topology);
        PagesTopologyIntuitionOverlay overlay = new(
            PagesTopologyOverlaySchemas.IntuitionOverlay,
            Sha('e'),
            Digest(topologyBytes),
            []);

        InvalidDataException error = Assert.Throws<InvalidDataException>(
            () => PagesTopologyIntuitionOverlayJson.Bind(
                overlay,
                topology,
                topologyBytes));

        Assert.Contains("different truth release", error.Message);
    }

    private static PagesCertifiedTopology EmptyTopology() => new(
        PagesTopologySchemas.CertifiedTopology,
        Sha('1'),
        new string('a', 40),
        new string('b', 40),
        PagesTopologySchemas.Algorithm,
        new PagesTopologySemantics(
            "frozen-node",
            "frozen-prerequisite",
            "longest-prerequisite-path",
            "weak-component",
            "all-certified-root-paths"),
        new PagesTopologySummary(0, 0, 0, 0, 0, 0),
        [],
        [],
        []);

    private static string Digest(byte[] bytes) =>
        "sha256:" + Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    private static string Sha(char value) =>
        "sha256:" + new string(value, 64);
}
