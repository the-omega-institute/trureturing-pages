using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Trureturing.Pages.Core;
using Xunit;

namespace Trureturing.Pages.Tests;

public sealed class AtlasProjectionTests
{
    [Fact]
    public void BuildsOneReleaseBoundAtlasViewAndManifest()
    {
        byte[] graphBytes = GraphBytes();
        byte[] topologyBytes = TopologyBytes();

        PagesAtlasProjectionArtifacts artifacts =
            PagesAtlasProjection.Build(
                graphBytes,
                topologyBytes);

        Assert.Equal(
            PagesAtlasSchemas.AtlasManifest,
            artifacts.Manifest.SchemaVersion);
        Assert.Equal(
            ReleaseDigest,
            artifacts.Manifest.TruthReleaseDigest);
        Assert.Equal(
            PagesAtlasProjection.CanonicalGraphPath,
            artifacts.Manifest.GraphPath);
        Assert.Equal(
            PagesAtlasProjection.CompatibilityGraphPaths,
            artifacts.Manifest.CompatibilityPaths);
        Assert.Equal(3, artifacts.Manifest.Counts.Nodes);
        Assert.Equal(2, artifacts.Manifest.Counts.TruthNodes);
        Assert.Equal(1, artifacts.Manifest.Counts.Edges);
        Assert.Equal(
            2,
            artifacts.Manifest.Counts.CertifiedTopologyNodes);
        Assert.Equal(
            Digest(graphBytes),
            artifacts.Manifest.InputGraphDigest);
        Assert.Equal(
            Digest(topologyBytes),
            artifacts.Manifest.CertifiedTopologyDigest);
        Assert.Equal(
            Digest(artifacts.GraphBytes),
            artifacts.Manifest.AtlasGraphDigest);

        using JsonDocument graph =
            JsonDocument.Parse(artifacts.GraphBytes);
        JsonElement root = graph.RootElement;
        Assert.Equal(
            PagesAtlasSchemas.AtlasView,
            root.GetProperty("schema_version").GetString());
        Assert.Equal(
            PagesAtlasSchemas.ProjectionProfile,
            root.GetProperty("atlas_projection")
                .GetProperty("projection_profile")
                .GetString());
        Assert.Equal(
            Digest(topologyBytes),
            root.GetProperty("source_snapshot")
                .GetProperty("certified_topology_digest")
                .GetString());
        Assert.Equal(
            2,
            root.GetProperty("counts")
                .GetProperty("certified_topology_nodes")
                .GetInt32());

        JsonElement alpha = Assert.Single(
            root.GetProperty("nodes").EnumerateArray(),
            node => node.GetProperty("id").GetString() == "A");
        Assert.Equal(
            "Alpha",
            alpha.GetProperty("human_title").GetString());
        Assert.Equal(
            5,
            alpha.GetProperty("descendant_cost").GetInt64());
        Assert.Equal(
            "1",
            alpha.GetProperty("normalized_reach").GetString());
        Assert.Equal(
            "3/2",
            alpha.GetProperty("dependency_betweenness")
                .GetString());
        Assert.Equal(
            PagesAtlasSchemas.CertifiedTopology,
            alpha.GetProperty("structure_source").GetString());

        JsonElement document = Assert.Single(
            root.GetProperty("nodes").EnumerateArray(),
            node => node.GetProperty("id").GetString() ==
                "blueprint:alpha");
        Assert.False(
            document.TryGetProperty(
                "descendant_cost",
                out _));

        using JsonDocument manifest =
            JsonDocument.Parse(artifacts.ManifestBytes);
        Assert.Equal(
            PagesAtlasSchemas.AtlasManifest,
            manifest.RootElement
                .GetProperty("schema_version")
                .GetString());
        Assert.Equal(
            PagesAtlasProjection.CanonicalGraphPath,
            manifest.RootElement
                .GetProperty("graph_path")
                .GetString());
        Assert.Equal(
            2,
            manifest.RootElement
                .GetProperty("compatibility_paths")
                .GetArrayLength());
    }

    [Fact]
    public void IsByteDeterministicForIdenticalInputs()
    {
        PagesAtlasProjectionArtifacts first =
            PagesAtlasProjection.Build(
                GraphBytes(),
                TopologyBytes());
        PagesAtlasProjectionArtifacts second =
            PagesAtlasProjection.Build(
                GraphBytes(),
                TopologyBytes());

        Assert.Equal(first.GraphBytes, second.GraphBytes);
        Assert.Equal(
            first.ManifestBytes,
            second.ManifestBytes);
    }

    [Fact]
    public void RejectsMixedReleaseAndIncompleteNodeClosure()
    {
        byte[] wrongRelease = TopologyBytes(
            releaseDigest:
                "sha256:" + new string('9', 64));
        InvalidDataException releaseError =
            Assert.Throws<InvalidDataException>(() =>
                PagesAtlasProjection.Build(
                    GraphBytes(),
                    wrongRelease));
        Assert.Contains(
            "different truth release",
            releaseError.Message,
            StringComparison.OrdinalIgnoreCase);

        byte[] unknownNode = TopologyBytes(
            secondNodeId: "C.lean");
        InvalidDataException closureError =
            Assert.Throws<InvalidDataException>(() =>
                PagesAtlasProjection.Build(
                    GraphBytes(),
                    unknownNode));
        Assert.Contains(
            "absent",
            closureError.Message,
            StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void RejectsDuplicateMembersAndNonReducedRationals()
    {
        string valid = Encoding.UTF8.GetString(
            TopologyBytes());
        byte[] duplicate = Encoding.UTF8.GetBytes(
            valid.Replace(
                "\"in_degree\": 0,",
                "\"in_degree\": 0, \"in_degree\": 0,",
                StringComparison.Ordinal));
        InvalidDataException duplicateError =
            Assert.Throws<InvalidDataException>(() =>
                PagesAtlasProjection.Build(
                    GraphBytes(),
                    duplicate));
        Assert.Contains(
            "duplicate",
            duplicateError.Message,
            StringComparison.OrdinalIgnoreCase);

        byte[] nonReduced = Encoding.UTF8.GetBytes(
            valid.Replace(
                "\"numerator\": 3, \"denominator\": 2",
                "\"numerator\": 6, \"denominator\": 4",
                StringComparison.Ordinal));
        InvalidDataException rationalError =
            Assert.Throws<InvalidDataException>(() =>
                PagesAtlasProjection.Build(
                    GraphBytes(),
                    nonReduced));
        Assert.Contains(
            "gcd-reduced",
            rationalError.Message,
            StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void RejectsUnknownTopologyFieldsAndFloatingLexemes()
    {
        string valid = Encoding.UTF8.GetString(
            TopologyBytes());
        byte[] unknown = Encoding.UTF8.GetBytes(
            valid.Replace(
                "\"out_degree\": 1,",
                "\"out_degree\": 1, \"page_rank\": 7,",
                StringComparison.Ordinal));
        InvalidDataException unknownError =
            Assert.Throws<InvalidDataException>(() =>
                PagesAtlasProjection.Build(
                    GraphBytes(),
                    unknown));
        Assert.Contains(
            "extra",
            unknownError.Message,
            StringComparison.OrdinalIgnoreCase);

        byte[] floating = Encoding.UTF8.GetBytes(
            valid.Replace(
                "\"descendant_cost\": 5",
                "\"descendant_cost\": 5.0",
                StringComparison.Ordinal));
        InvalidDataException floatingError =
            Assert.Throws<InvalidDataException>(() =>
                PagesAtlasProjection.Build(
                    GraphBytes(),
                    floating));
        Assert.Contains(
            "floating-point",
            floatingError.Message,
            StringComparison.OrdinalIgnoreCase);
    }

    private const string ReleaseDigest =
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    private static byte[] GraphBytes() =>
        Encoding.UTF8.GetBytes(
            $$"""
            {
              "schema_version": "pages-truth-release-dag.v1",
              "synthetic": true,
              "source_snapshot": {
                "source_repo": "the-omega-institute/trureturing",
                "source_commit": "1111111111111111111111111111111111111111",
                "source_tree": "2222222222222222222222222222222222222222",
                "truth_release_digest": "{{ReleaseDigest}}",
                "truth_graph_sha256": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                "topology_algorithm": "Trureturing.Topology/0.1.0-alpha.1"
              },
              "counts": {
                "nodes": 3,
                "truth_nodes": 2,
                "blueprint_nodes": 1,
                "dag_closed": 2,
                "dag_open": 0,
                "dag_tail": 0,
                "dag_semantic": 0,
                "edges": 1,
                "truth_edges": 1,
                "blueprint_links": 0
              },
              "nodes": [
                {
                  "id": "A",
                  "gid": "A",
                  "title": "A",
                  "status": "Closed",
                  "state": "closed",
                  "kind": "truth",
                  "summary": "Closed | depth 0 | A.lean",
                  "depth": 0,
                  "repo_path": "A.lean",
                  "layer": "D5/S0",
                  "domain": "Alpha",
                  "human_title": "Alpha",
                  "human_abstract": "The foundation.",
                  "knowledge_page": "knowledge/node/a/"
                },
                {
                  "id": "B",
                  "gid": "B",
                  "title": "B",
                  "status": "Closed",
                  "state": "closed",
                  "kind": "truth",
                  "summary": "Closed | depth 1 | B.lean",
                  "depth": 1,
                  "repo_path": "B.lean",
                  "layer": "D5/S1",
                  "domain": "Beta",
                  "human_title": "Beta"
                },
                {
                  "id": "blueprint:alpha",
                  "gid": null,
                  "title": "Alpha document",
                  "status": "Semantic",
                  "state": "semantic",
                  "kind": "blueprint",
                  "summary": "Blueprint | Blueprint/Alpha.md",
                  "depth": 0,
                  "repo_path": "Blueprint/Alpha.md",
                  "layer": "Blueprint",
                  "domain": "Document"
                }
              ],
              "edges": [
                {
                  "source": "A",
                  "target": "B",
                  "dependency": "A.lean",
                  "dependent": "B.lean",
                  "layer": "truth-dependency"
                }
              ],
              "human_labels": {
                "blueprint_ref": "fixture"
              }
            }
            """);

    private static byte[] TopologyBytes(
        string releaseDigest = ReleaseDigest,
        string secondNodeId = "B.lean") =>
        Encoding.UTF8.GetBytes(
            $$"""
            {
              "schema_version": "certified-topology.v1",
              "truth_release_digest": "{{releaseDigest}}",
              "algorithm_profile_digest": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
              "producer_commit": "3333333333333333333333333333333333333333",
              "nodes": [
                {
                  "node_id": "A.lean",
                  "in_degree": 0,
                  "out_degree": 1,
                  "min_depth": 0,
                  "max_depth": 0,
                  "ancestor_count": 0,
                  "descendant_count": 1,
                  "descendant_cost": 5,
                  "normalized_reach": {
                    "numerator": 1,
                    "denominator": 1
                  },
                  "dependency_betweenness": {
                    "numerator": 3, "denominator": 2
                  }
                },
                {
                  "node_id": "{{secondNodeId}}",
                  "in_degree": 1,
                  "out_degree": 0,
                  "min_depth": 1,
                  "max_depth": 1,
                  "ancestor_count": 1,
                  "descendant_count": 0,
                  "descendant_cost": 1,
                  "normalized_reach": {
                    "numerator": 0,
                    "denominator": 1
                  },
                  "dependency_betweenness": {
                    "numerator": 0,
                    "denominator": 1
                  }
                }
              ],
              "cycle_certificate": {
                "status": "acyclic",
                "cycles": []
              },
              "dangling_reference_certificate": {
                "status": "complete",
                "dangling_references": []
              }
            }
            """);

    private static string Digest(ReadOnlySpan<byte> bytes) =>
        "sha256:" +
        Convert.ToHexStringLower(
            SHA256.HashData(bytes));
}
