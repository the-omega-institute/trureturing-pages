using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Trureturing.Pages.Core;
using Xunit;

namespace Trureturing.Pages.Tests;

public sealed class ConformationTests
{
    [Fact]
    public void BuildsByteDeterministicFixedPointCoordinatesAndBindsManifest()
    {
        byte[] graph = GraphBytes(Release('a'), includeGamma: true);
        byte[] manifest = ManifestBytes(graph, Release('a'));

        PagesConformationArtifacts first = PagesConformation.Build(
            graph,
            manifest);
        PagesConformationArtifacts second = PagesConformation.Build(
            graph,
            manifest);

        Assert.Equal(first.ConformationBytes, second.ConformationBytes);
        Assert.Equal(first.BoundManifestBytes, second.BoundManifestBytes);
        Assert.Equal(
            PagesConformationSchemas.Conformation,
            first.Conformation.SchemaVersion);
        Assert.Equal(
            PagesConformationSchemas.LayoutProfile,
            first.Conformation.LayoutProfile.Name);
        Assert.Equal(
            PagesConformationSchemas.LayoutProfileDigest,
            first.Conformation.LayoutProfile.Digest);
        Assert.Equal(
            PagesConformationSchemas.CoordinateScale,
            first.Conformation.CoordinateEncoding.Scale);
        Assert.Equal(4, first.Conformation.Nodes.Count);
        Assert.NotEmpty(first.Conformation.Regions);
        Assert.All(
            first.Conformation.Regions,
            region => Assert.Equal(
                "pages-derived-fallback",
                region.Authority));

        using JsonDocument bound = JsonDocument.Parse(
            first.BoundManifestBytes);
        Assert.Equal(
            first.ConformationDigest,
            bound.RootElement
                .GetProperty("conformation_digest")
                .GetString());
        Assert.Equal(
            Digest(first.ConformationBytes),
            first.ConformationDigest);
        Assert.DoesNotContain(
            ".0",
            Encoding.UTF8.GetString(first.ConformationBytes),
            StringComparison.Ordinal);
    }

    [Fact]
    public void UsesCertifiedDepthForTheVerticalAxisAndStableFallbackRegions()
    {
        byte[] graph = GraphBytes(Release('a'), includeGamma: true);
        PagesConformationDocument conformation = PagesConformation.Build(
            graph,
            ManifestBytes(graph, Release('a'))).Conformation;
        Dictionary<string, PagesConformationNode> nodes = conformation.Nodes
            .ToDictionary(node => node.NodeId, StringComparer.Ordinal);

        Assert.Equal(0, nodes["A"].Aligned.Y);
        Assert.Equal(
            PagesConformationSchemas.DepthStep,
            nodes["B"].Aligned.Y);
        Assert.Equal(
            2 * PagesConformationSchemas.DepthStep,
            nodes["C"].Aligned.Y);
        Assert.Equal(
            nodes["B"].TrueDepth * PagesConformationSchemas.DepthStep,
            nodes["B"].Intrinsic.Y);
        Assert.Equal(
            nodes["A"].RegionId,
            conformation.Regions.Single(region =>
                region.MemberNodeIds.Contains("A", StringComparer.Ordinal))
                .RegionId);
        Assert.NotEqual(nodes["A"].RegionId, nodes["B"].RegionId);
        Assert.Equal(
            ["intrinsic-placement"],
            nodes["C"].MovementReasons);
    }

    [Fact]
    public void IntrinsicPlacementIsIndependentOfNodeAndEdgeEnumerationOrder()
    {
        byte[] orderedGraph = GraphBytes(
            Release('a'),
            includeGamma: true,
            reverse: false);
        byte[] reversedGraph = GraphBytes(
            Release('a'),
            includeGamma: true,
            reverse: true);
        PagesConformationDocument ordered = PagesConformation.Build(
            orderedGraph,
            ManifestBytes(orderedGraph, Release('a'))).Conformation;
        PagesConformationDocument reversed = PagesConformation.Build(
            reversedGraph,
            ManifestBytes(reversedGraph, Release('a'))).Conformation;

        Dictionary<string, PagesConformationPoint> orderedPoints = ordered.Nodes
            .ToDictionary(
                node => node.NodeId,
                node => node.Intrinsic,
                StringComparer.Ordinal);
        Dictionary<string, PagesConformationPoint> reversedPoints = reversed.Nodes
            .ToDictionary(
                node => node.NodeId,
                node => node.Intrinsic,
                StringComparer.Ordinal);
        Assert.Equal(
            orderedPoints.OrderBy(pair => pair.Key, StringComparer.Ordinal),
            reversedPoints.OrderBy(pair => pair.Key, StringComparer.Ordinal));
    }

    [Fact]
    public void AlignsRetainedNodesAndSeedsNewNodesFromTheirNeighborhood()
    {
        byte[] firstGraph = GraphBytes(
            Release('a'),
            includeGamma: false);
        PagesConformationArtifacts first = PagesConformation.Build(
            firstGraph,
            ManifestBytes(firstGraph, Release('a')));

        byte[] nextGraph = GraphBytes(
            Release('b'),
            includeGamma: true);
        PagesConformationArtifacts next = PagesConformation.Build(
            nextGraph,
            ManifestBytes(nextGraph, Release('b')),
            first.ConformationBytes);
        Dictionary<string, PagesConformationNode> nodes = next.Conformation.Nodes
            .ToDictionary(node => node.NodeId, StringComparer.Ordinal);

        Assert.Equal(
            Digest(first.ConformationBytes),
            next.Conformation.PreviousConformationDigest);
        Assert.Contains(
            "retained-node-alignment",
            nodes["A"].MovementReasons,
            StringComparer.Ordinal);
        Assert.Contains(
            "retained-node-alignment",
            nodes["B"].MovementReasons,
            StringComparer.Ordinal);
        Assert.Equal(
            ["new-node-neighborhood-seed"],
            nodes["C"].MovementReasons);
        Assert.Equal(
            2 * PagesConformationSchemas.DepthStep,
            nodes["C"].Aligned.Y);
    }

    [Fact]
    public void RejectsMixedGraphBindingsAndAlreadyBoundManifest()
    {
        byte[] graph = GraphBytes(Release('a'), includeGamma: true);
        byte[] wrongManifest = ManifestBytes(
            graph,
            Release('b'));
        InvalidDataException release = Assert.Throws<InvalidDataException>(() =>
            PagesConformation.Build(graph, wrongManifest));
        Assert.Contains(
            "different release inputs",
            release.Message,
            StringComparison.OrdinalIgnoreCase);

        string valid = Encoding.UTF8.GetString(
            ManifestBytes(graph, Release('a')));
        byte[] rebound = Encoding.UTF8.GetBytes(
            valid.Replace(
                "\"conformation_digest\": null",
                $"\"conformation_digest\": \"{Digest(Encoding.UTF8.GetBytes("occupied"))}\"",
                StringComparison.Ordinal));
        InvalidDataException occupied = Assert.Throws<InvalidDataException>(() =>
            PagesConformation.Build(graph, rebound));
        Assert.Contains(
            "already bound",
            occupied.Message,
            StringComparison.OrdinalIgnoreCase);
    }

    private static byte[] GraphBytes(
        string release,
        bool includeGamma,
        bool reverse = false)
    {
        string gammaNode = includeGamma
            ? """
              ,{
                "id":"C",
                "kind":"truth",
                "state":"open",
                "status":"Open",
                "layer":"D5/X_Frontier",
                "domain":"Gamma",
                "true_depth":2,
                "descendant_cost":1
              }
              """
            : string.Empty;
        string gammaEdge = includeGamma
            ? """
              ,{
                "source":"B",
                "target":"C",
                "layer":"truth-dependency"
              }
              """
            : string.Empty;
        string nodes = $$"""
              {
                "id":"A",
                "kind":"truth",
                "state":"closed",
                "status":"Closed",
                "layer":"D5/S0",
                "domain":"Alpha",
                "true_depth":0,
                "descendant_cost":8
              },
              {
                "id":"B",
                "kind":"truth",
                "state":"closed",
                "status":"Closed",
                "layer":"D5/S1",
                "domain":"Beta",
                "true_depth":1,
                "descendant_cost":4
              }
              {{gammaNode}},
              {
                "id":"blueprint:A",
                "kind":"blueprint",
                "state":"semantic",
                "status":"Semantic",
                "layer":"Blueprint",
                "domain":"Document",
                "depth":0
              }
            """;
        string edges = $$"""
              {
                "source":"A",
                "target":"B",
                "layer":"truth-dependency"
              }
              {{gammaEdge}},
              {
                "source":"blueprint:A",
                "target":"A",
                "layer":"blueprint-truth-anchor"
              }
            """;
        if (reverse)
        {
            nodes = string.Join(
                ",",
                SplitObjects(nodes).Reverse());
            edges = string.Join(
                ",",
                SplitObjects(edges).Reverse());
        }

        return Encoding.UTF8.GetBytes(
            $$"""
            {
              "schema_version":"pages-atlas-view.v1",
              "source_snapshot":{
                "truth_release_digest":"{{release}}",
                "certified_topology_digest":"{{TopologyDigest}}"
              },
              "nodes":[{{nodes}}],
              "edges":[{{edges}}]
            }
            """);
    }

    private static IEnumerable<string> SplitObjects(string value)
    {
        var result = new List<string>();
        int depth = 0;
        int start = -1;
        for (int index = 0; index < value.Length; index++)
        {
            if (value[index] == '{')
            {
                if (depth == 0) start = index;
                depth++;
            }
            else if (value[index] == '}')
            {
                depth--;
                if (depth == 0 && start >= 0)
                {
                    result.Add(value[start..(index + 1)]);
                    start = -1;
                }
            }
        }
        return result;
    }

    private static byte[] ManifestBytes(
        byte[] graph,
        string release) =>
        Encoding.UTF8.GetBytes(
            $$"""
            {
              "schema_version":"pages-atlas-manifest.v1",
              "truth_release_digest":"{{release}}",
              "source_commit":"1111111111111111111111111111111111111111",
              "source_tree":"2222222222222222222222222222222222222222",
              "input_graph_digest":"{{Digest(Encoding.UTF8.GetBytes("input"))}}",
              "certified_topology_digest":"{{TopologyDigest}}",
              "atlas_graph_digest":"{{Digest(graph)}}",
              "certified_topology_profile_digest":"{{Digest(Encoding.UTF8.GetBytes("profile"))}}",
              "topology_producer_commit":"3333333333333333333333333333333333333333",
              "topology_atlas_digest":null,
              "conformation_digest":null,
              "projection_profile":"pages-atlas-projection-v1",
              "graph_path":"data/pages-atlas-view.v1.json",
              "compatibility_paths":["data/certified-topology-view.v1.json"],
              "counts":{
                "nodes":4,
                "truth_nodes":3,
                "edges":3,
                "certified_topology_nodes":3
              }
            }
            """);

    private const string TopologyDigest =
        "sha256:cccccccccccccccccccccccccccccccc" +
        "cccccccccccccccccccccccccccccccc";

    private static string Release(char value) =>
        "sha256:" + new string(value, 64);

    private static string Digest(ReadOnlySpan<byte> value) =>
        "sha256:" + Convert.ToHexStringLower(SHA256.HashData(value));
}
