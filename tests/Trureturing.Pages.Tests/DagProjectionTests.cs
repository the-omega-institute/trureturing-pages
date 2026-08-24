using Trureturing.Pages.Core;

namespace Trureturing.Pages.Tests;

public sealed class DagProjectionTests
{
    [Fact]
    public void CertifiedAndAdvisoryEdgesStayInSeparateLayers()
    {
        PagesTruthReleasePort port = Port();
        var overlay = new PagesIntuitionOverlay(
            PagesSchemas.IntuitionOverlay,
            port.ReleaseDigest,
            new[]
            {
                new PagesCandidateRelation(
                    "relation-1",
                    "bridge",
                    "proposed",
                    new[] { "module:A" },
                    new[] { "module:B" },
                    Array.Empty<string>())
            });

        PagesDagArtifacts artifacts = PagesDagProjection.Build(port, overlay);

        Assert.Contains(
            artifacts.Root.Edges,
            edge => edge.Layer == "module-import" && edge.Status == "certified");
        Assert.Contains(
            artifacts.Root.Edges,
            edge => edge.Layer == "frozen-prerequisite" && edge.Status == "certified");
        Assert.Contains(
            artifacts.Root.Edges,
            edge => edge.Layer == "intuition-candidate" && edge.Status == "proposed");
        Assert.Equal(2, artifacts.Root.CertifiedEdgeCount);
        Assert.Equal(1, artifacts.Root.AdvisoryEdgeCount);
    }

    [Fact]
    public void NeighborhoodContainsOnlyRequestedRadius()
    {
        PagesDagArtifacts artifacts = PagesDagProjection.Build(Port(), neighborhoodRadius: 1);
        string file = artifacts.Root.NeighborhoodFiles["module:A"];
        PagesDagNeighborhood neighborhood = artifacts.Neighborhoods[file];

        Assert.Equal("module:A", neighborhood.CenterId);
        Assert.Contains(neighborhood.Nodes, node => node.Id == "module:A");
        Assert.Contains(neighborhood.Nodes, node => node.Id == "module:B");
        Assert.DoesNotContain(neighborhood.Nodes, node => node.Id == "frozen:" + Hash('c'));
    }

    [Fact]
    public void ReleaseDeltaReportsNewFrozenTruth()
    {
        PagesTruthReleasePort before = Port();
        PagesTruthReleasePort after = before with
        {
            ReleaseDigest = Sha('9'),
            FrozenNodes = before.FrozenNodes.Concat(
                new[]
                {
                    new PagesFrozenNode(
                        Hash('d'),
                        "D.lean",
                        new[] { "D.theorem" },
                        Array.Empty<string>())
                }).ToArray(),
            FrozenEdges = before.FrozenEdges.Concat(
                new[]
                {
                    new PagesFrozenEdge(Hash('c'), Hash('d'))
                }).ToArray()
        };

        PagesReleaseDelta delta = PagesDagProjection.Compare(before, after);

        Assert.Equal(new[] { Hash('d') }, delta.AddedFrozenNodes);
        Assert.Single(delta.AddedCertifiedEdges);
        Assert.Empty(delta.RemovedFrozenNodes);
    }

    [Fact]
    public void PortRejectsBrokenProofDag()
    {
        PagesTruthReleasePort port = Port() with
        {
            FrozenEdges = new[]
            {
                new PagesFrozenEdge(Hash('c'), Hash('x'))
            }
        };

        byte[] bytes = PagesPortJson.Write(port);
        InvalidDataException error = Assert.Throws<InvalidDataException>(
            () => PagesPortJson.ReadTruthReleasePort(bytes));

        Assert.Contains("absent", error.Message, StringComparison.Ordinal);
    }

    private static PagesTruthReleasePort Port()
    {
        return new PagesTruthReleasePort(
            PagesSchemas.TruthReleasePort,
            Sha('1'),
            new string('a', 40),
            new string('b', 40),
            new[]
            {
                new PagesModuleNode("A", "A", "closed", 0, "A.lean"),
                new PagesModuleNode("B", "B", "open", 1, "B.lean")
            },
            new[]
            {
                new PagesModuleEdge("A", "B")
            },
            new[]
            {
                new PagesFrozenNode(
                    Hash('c'),
                    "C.lean",
                    new[] { "C.theorem" },
                    Array.Empty<string>()),
                new PagesFrozenNode(
                    Hash('e'),
                    "E.lean",
                    new[] { "E.theorem" },
                    Array.Empty<string>())
            },
            new[]
            {
                new PagesFrozenEdge(Hash('c'), Hash('e'))
            },
            new[]
            {
                new PagesDocumentAnchor("A", "Blueprint/A.html")
            });
    }

    private static string Sha(char value) => "sha256:" + new string(value, 64);
    private static string Hash(char value) => "sha256:" + new string(value, 64);
}
