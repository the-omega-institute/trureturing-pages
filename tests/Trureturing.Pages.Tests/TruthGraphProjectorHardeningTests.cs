using System.Text;
using Trureturing.Pages.Core;
using Xunit;

namespace Trureturing.Pages.Tests;

public sealed class TruthGraphProjectorHardeningTests
{
    [Fact]
    public void Project_rejects_duplicate_display_gids()
    {
        var graph = Graph(
            """
            {"depth":0,"gid":"A/Duplicate","module_name":"A.One","repo_path":"A/One.lean","state":"closed"},
            {"depth":1,"gid":"A/Duplicate","module_name":"A.Two","repo_path":"A/Two.lean","state":"open"}
            """,
            "{\"closed\":1,\"open\":1,\"tail\":0,\"semantic\":0}");

        Assert.Throws<ProjectionException>(() =>
            TruthGraphProjector.Project(graph, Snapshot));
    }

    [Fact]
    public void Project_rejects_per_state_drift_that_preserves_the_total()
    {
        var graph = Graph(
            """
            {"depth":0,"gid":"A/Closed","module_name":"A.Closed","repo_path":"A/Closed.lean","state":"closed"},
            {"depth":1,"gid":"A/Open","module_name":"A.Open","repo_path":"A/Open.lean","state":"open"},
            {"depth":2,"gid":"A/Tail","module_name":"A.Tail","repo_path":"A/Tail.lean","state":"tail"},
            {"depth":3,"gid":null,"module_name":"Root","repo_path":"Root.lean","state":"closed"}
            """,
            // The math total remains four, but one Closed count has been relabelled Open.
            "{\"closed\":1,\"open\":2,\"tail\":1,\"semantic\":0}");

        Assert.Throws<ProjectionException>(() =>
            TruthGraphProjector.Project(graph, Snapshot));
    }

    private static byte[] Graph(string nodes, string stateCounts) =>
        Encoding.UTF8.GetBytes(
            $$"""
            {
              "schema":"stratalint.truth-graph.v1",
              "schema_version":1,
              "truth":{
                "nodes":[{{nodes}}],
                "edges":[],
                "state_counts":{{stateCounts}},
                "open_blockers":[]
              },
              "documents":{},
              "joins":{},
              "provenance":{},
              "deferred_layers":[]
            }
            """);

    private static readonly byte[] Snapshot = Encoding.UTF8.GetBytes(
        """
        {
          "schema":"source-snapshot.v1",
          "source_repo":"the-omega-institute/trureturing",
          "source_commit":"abc123",
          "truth_graph_sha256":"deadbeef",
          "blessed_by":"AlyciaBHZ",
          "derived_at":"2026-08-15T00:00:00Z"
        }
        """);
}
