using System.Security.Cryptography;
using System.Text;
using Trureturing.Pages.Core;
using Xunit;

namespace Trureturing.Pages.Tests;

public sealed class TruthGraphProjectorTests
{
    private static readonly byte[] TruthGraphBytes = Encoding.UTF8.GetBytes(TruthGraphJson);
    private static readonly byte[] SnapshotBytes = Encoding.UTF8.GetBytes(SnapshotJson);

    [Fact]
    public void Project_matches_the_current_python_projection_byte_for_byte()
    {
        var actual = TruthGraphProjector.Project(TruthGraphBytes, SnapshotBytes);
        var expected = Encoding.UTF8.GetBytes(ExpectedProjection + "\n");

        Assert.Equal(expected, actual);
        Assert.Equal(
            "849150fa714a4e1c72a4a9972259e94d49f22ecf6ae65b6921aaf19c064d90b1",
            Sha256(actual));
    }

    [Fact]
    public void Project_rejects_duplicate_object_members()
    {
        var duplicate = Encoding.UTF8.GetBytes(
            "{\"truth\":{\"nodes\":[],\"nodes\":[]}}");

        Assert.Throws<ProjectionException>(() =>
            TruthGraphProjector.Project(duplicate, SnapshotBytes));
    }

    [Fact]
    public void Project_rejects_a_missing_truth_object()
    {
        var malformed = Encoding.UTF8.GetBytes("{\"schema\":\"stratalint.truth-graph.v1\"}");

        Assert.Throws<ProjectionException>(() =>
            TruthGraphProjector.Project(malformed, SnapshotBytes));
    }

    [Fact]
    public void Project_rejects_unknown_input_schemas()
    {
        var wrongGraph = Encoding.UTF8.GetBytes(
            TruthGraphJson.Replace(
                "stratalint.truth-graph.v1",
                "stratalint.truth-graph.v0",
                StringComparison.Ordinal));
        var wrongSnapshot = Encoding.UTF8.GetBytes(
            SnapshotJson.Replace(
                "source-snapshot.v1",
                "source-snapshot.v0",
                StringComparison.Ordinal));

        Assert.Throws<ProjectionException>(() =>
            TruthGraphProjector.Project(wrongGraph, SnapshotBytes));
        Assert.Throws<ProjectionException>(() =>
            TruthGraphProjector.Project(TruthGraphBytes, wrongSnapshot));
    }

    [Fact]
    public void Project_rejects_dag_state_count_drift()
    {
        var drifted = Encoding.UTF8.GetBytes(
            TruthGraphJson.Replace("\"closed\": 2", "\"closed\": 3", StringComparison.Ordinal));

        Assert.Throws<ProjectionException>(() =>
            TruthGraphProjector.Project(drifted, SnapshotBytes));
    }

    [Fact]
    public void Project_and_write_binds_raw_bytes_to_both_blessing_and_trigger()
    {
        var directory = Directory.CreateTempSubdirectory("pages-projector-");
        try
        {
            var truthGraphPath = Path.Combine(directory.FullName, "truth-graph.json");
            var snapshotPath = Path.Combine(directory.FullName, "snapshot.json");
            var outputPath = Path.Combine(directory.FullName, "projection.json");
            File.WriteAllBytes(truthGraphPath, TruthGraphBytes);
            var digest = Sha256(TruthGraphBytes);
            var utf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
            File.WriteAllText(
                snapshotPath,
                SnapshotJson.Replace("deadbeef", digest, StringComparison.Ordinal),
                utf8);

            var written = ProjectionFileService.ProjectAndWrite(
                truthGraphPath,
                snapshotPath,
                outputPath,
                digest);

            Assert.Equal(written, File.ReadAllBytes(outputPath));
            var sentinel = Encoding.UTF8.GetBytes("existing-output");
            File.WriteAllBytes(outputPath, sentinel);

            Assert.Throws<ProjectionException>(() =>
                ProjectionFileService.ProjectAndWrite(
                    truthGraphPath,
                    snapshotPath,
                    outputPath,
                    new string('0', 64)));
            Assert.Equal(sentinel, File.ReadAllBytes(outputPath));

            File.WriteAllText(
                snapshotPath,
                SnapshotJson.Replace("deadbeef", new string('0', 64), StringComparison.Ordinal),
                utf8);
            Assert.Throws<ProjectionException>(() =>
                ProjectionFileService.ProjectAndWrite(
                    truthGraphPath,
                    snapshotPath,
                    outputPath,
                    digest));

            Assert.Equal(sentinel, File.ReadAllBytes(outputPath));
            Assert.Empty(Directory.GetFiles(directory.FullName, "*.tmp-*"));
        }
        finally
        {
            directory.Delete(recursive: true);
        }
    }

    private static string Sha256(byte[] bytes) =>
        Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    private const string TruthGraphJson = """
{
  "schema": "stratalint.truth-graph.v1",
  "schema_version": 1,
  "truth": {
    "nodes": [
      {"depth": 0, "gid": "A/Closed", "module_name": "A.Closed", "repo_path": "A/Closed.lean", "state": "closed"},
      {"depth": 2, "gid": "A/Open", "module_name": "A.Open", "repo_path": "A/Open.lean", "state": "open"},
      {"depth": 1, "gid": "A/Tail", "module_name": "A.Tail", "repo_path": "A/Tail.lean", "state": "tail"},
      {"depth": 9, "gid": null, "module_name": "Root", "repo_path": "Root.lean", "state": "closed"},
      {"depth": 0, "gid": null, "module_name": null, "repo_path": ".github/CODEOWNERS", "state": "semantic"}
    ],
    "edges": [{"dependency": "A/Closed", "dependent": "A/Open"}],
    "state_counts": {"closed": 2, "open": 1, "tail": 1, "semantic": 1},
    "open_blockers": []
  },
  "documents": {},
  "joins": {},
  "provenance": {},
  "deferred_layers": []
}
""";

    private const string SnapshotJson = """
{
  "schema": "source-snapshot.v1",
  "source_repo": "the-omega-institute/trureturing",
  "source_commit": "abc123",
  "truth_graph_sha256": "deadbeef",
  "blessed_by": "AlyciaBHZ",
  "derived_at": "2026-08-15T00:00:00Z"
}
""";

    private const string ExpectedProjection = """
{
  "schema_version": "truth-graph.v1",
  "synthetic": false,
  "source_snapshot": {
    "source_repo": "the-omega-institute/trureturing",
    "source_commit": "abc123",
    "truth_graph_sha256": "deadbeef",
    "blessed_by": "AlyciaBHZ",
    "approved_at": "2026-08-15T00:00:00Z"
  },
  "counts": {
    "shown": 3,
    "shown_closed": 1,
    "shown_open": 1,
    "shown_tail": 1,
    "dag_closed": 2,
    "dag_open": 1,
    "dag_tail": 1,
    "dag_semantic": 1,
    "filtered_no_gid": 1,
    "edges": 1
  },
  "note": "Showing 3 of 4 mathematical nodes; 1 carry no GID (the umbrella root module) and are not listed.",
  "nodes": [
    {
      "id": "A/Open",
      "title": "A.Open",
      "status": "Open",
      "summary": "Open · depth 2 · A/Open.lean",
      "depth": 2
    },
    {
      "id": "A/Tail",
      "title": "A.Tail",
      "status": "Tail",
      "summary": "Tail · depth 1 · A/Tail.lean",
      "depth": 1
    },
    {
      "id": "A/Closed",
      "title": "A.Closed",
      "status": "Closed",
      "summary": "Closed · depth 0 · A/Closed.lean",
      "depth": 0
    }
  ]
}
""";
}
