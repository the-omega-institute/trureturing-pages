using Trureturing.Pages.Core;
using Xunit;

namespace Trureturing.Pages.Tests;

public sealed class CertifiedTopologyConsumptionTests
{
    [Fact]
    public void ProjectsTrueMetricsWithoutRecomputingVisualAuthority()
    {
        PagesCertifiedTopology topology = Diamond();

        PagesCertifiedTopologyView view =
            PagesCertifiedTopologyProjection.Build(topology);

        Assert.Equal(PagesTopologySchemas.SiteView, view.SchemaVersion);
        Assert.Equal(Sha('1'), view.SourceSnapshot.TruthReleaseDigest);
        Assert.Equal(4, view.Counts.Nodes);
        Assert.Equal(4, view.Counts.Edges);
        Assert.Equal(0, view.Counts.AdvisoryEdges);

        PagesTopologyViewNode root = Assert.Single(
            view.Nodes,
            node => node.Gid == Id('a'));
        Assert.Equal(0, root.TrueDepth);
        Assert.Equal(2, root.Height);
        Assert.Equal(4, root.StructuralBlastRadius);
        Assert.Equal(3, root.DominatedNodeCount);
        Assert.Equal("kernel-pure", root.AxiomTier);
    }

    [Fact]
    public void AdvisoryOverlayDoesNotChangeCertifiedCounts()
    {
        PagesCertifiedTopology topology = Diamond();
        var overlay = new PagesIntuitionOverlay(
            PagesSchemas.IntuitionOverlay,
            topology.SourceTruthReleaseDigest,
            [
                new PagesCandidateRelation(
                    "candidate:bridge",
                    "bridge",
                    "proposed",
                    [$"frozen:{Id('b')}"],
                    [$"frozen:{Id('c')}"],
                    [Sha('e')])
            ]);

        PagesCertifiedTopologyView view =
            PagesCertifiedTopologyProjection.Build(topology, overlay);

        Assert.Equal(4, view.Counts.Edges);
        Assert.Equal(1, view.Counts.AdvisoryEdges);
        PagesTopologyViewEdge candidate = Assert.Single(
            view.Edges,
            edge => edge.Layer == "intuition-candidate");
        Assert.Equal("proposed", candidate.Status);
    }

    [Fact]
    public void RejectsTopologyWhoseMetricsDisagreeWithCertifiedEdges()
    {
        PagesCertifiedTopology invalid = Diamond() with
        {
            Nodes = Diamond().Nodes.Select(node =>
                node.Id == Id('d') ? node with { Depth = 1 } : node).ToArray()
        };

        InvalidDataException error = Assert.Throws<InvalidDataException>(
            () => PagesCertifiedTopologyJson.Validate(invalid));

        Assert.Contains("true depth", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    private static PagesCertifiedTopology Diamond()
    {
        PagesCertifiedTopologyNode[] nodes =
        [
            Node('a', "D5/S0/Foundation/A.lean", [], 0, 2, 0, 2, 0, 3, 3, 4, true, false),
            Node('b', "D5/S1/Bridge/B.lean", [Id('a')], 1, 1, 1, 1, 1, 1, 0, 2, false, false,
                ["Classical.choice"], "choice"),
            Node('c', "D5/S1/Bridge/C.lean", [Id('a')], 1, 1, 1, 1, 1, 1, 0, 2, false, false),
            Node('d', "D5/S3/Target/D.lean", [Id('b'), Id('c')], 2, 0, 2, 0, 3, 0, 0, 1, false, true)
        ];

        PagesCertifiedTopologyEdge[] edges =
        [
            new(Id('a'), Id('b')),
            new(Id('a'), Id('c')),
            new(Id('b'), Id('d')),
            new(Id('c'), Id('d'))
        ];

        return new PagesCertifiedTopology(
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
            new PagesTopologySummary(4, 4, 1, 1, 1, 2),
            nodes,
            edges,
            [new PagesCertifiedTopologyComponent("component:0", 4, 4, 2)]);
    }

    private static PagesCertifiedTopologyNode Node(
        char id,
        string path,
        IReadOnlyList<string> prerequisites,
        int depth,
        int height,
        int inDegree,
        int outDegree,
        int ancestors,
        int descendants,
        int dominated,
        int blast,
        bool root,
        bool leaf,
        IReadOnlyList<string>? axioms = null,
        string? tier = "kernel-pure") =>
        new(
            Id(id),
            path,
            [$"D5.Test.{char.ToUpperInvariant(id)}"],
            prerequisites,
            axioms ?? [],
            tier,
            $"Blueprint/{char.ToUpperInvariant(id)}.html",
            "component:0",
            depth,
            height,
            inDegree,
            outDegree,
            ancestors,
            descendants,
            dominated,
            blast,
            root,
            leaf);

    private static string Id(char value) =>
        "sha256:" + new string(value, 64);

    private static string Sha(char value) =>
        "sha256:" + new string(value, 64);
}
