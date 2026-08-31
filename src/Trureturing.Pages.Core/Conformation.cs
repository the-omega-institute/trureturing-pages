using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Trureturing.Pages.Core;

public static class PagesConformationSchemas
{
    public const string Conformation = "pages-conformation.v1";
    public const string LayoutProfile = "pages-hierarchical-fixed-point-v1";
    public const string FallbackStructureSource = "pages-fallback-regions";
    public const int CoordinateScale = 1000;
    public const long DepthStep = 180_000;
    public const long RegionSpacing = 520_000;
    public const long NodeSpacing = 56_000;
    public const int RelaxationPasses = 8;

    private const string CanonicalProfile =
        "pages-hierarchical-fixed-point-v1\n" +
        "coordinate-scale=1000\n" +
        "depth-step=180000\n" +
        "region-spacing=520000\n" +
        "node-spacing=56000\n" +
        "relaxation-passes=8\n" +
        "region-source=layer-domain-fallback\n" +
        "alignment=three-quarter-previous-one-quarter-intrinsic\n";

    public static string LayoutProfileDigest { get; } =
        PagesStrictJson.Sha256(Encoding.UTF8.GetBytes(CanonicalProfile));
}

public sealed record PagesConformationProfile(
    string Name,
    string Digest);

public sealed record PagesCoordinateEncoding(
    string Type,
    int Scale);

public sealed record PagesConformationAxes(
    string DepthAxis,
    long DepthStep);

public sealed record PagesConformationPoint(
    long X,
    long Y,
    long Z);

public sealed record PagesConformationNode(
    string NodeId,
    string RegionId,
    long TrueDepth,
    PagesConformationPoint Intrinsic,
    PagesConformationPoint Aligned,
    IReadOnlyList<string> MovementReasons);

public sealed record PagesConformationRegion(
    string RegionId,
    string Label,
    string Authority,
    IReadOnlyList<string> MemberNodeIds,
    PagesConformationPoint IntrinsicCentroid,
    PagesConformationPoint AlignedCentroid,
    long DepthMin,
    long DepthMax);

public sealed record PagesConformationCameraPreset(
    string Name,
    PagesConformationPoint Position,
    PagesConformationPoint LookAt);

public sealed record PagesConformationDocument(
    string SchemaVersion,
    string TruthReleaseDigest,
    string AtlasGraphDigest,
    string CertifiedTopologyDigest,
    string? TopologyAtlasDigest,
    PagesConformationProfile LayoutProfile,
    string StructureSource,
    string? PreviousConformationDigest,
    PagesCoordinateEncoding CoordinateEncoding,
    PagesConformationAxes Axes,
    IReadOnlyList<PagesConformationRegion> Regions,
    IReadOnlyList<PagesConformationNode> Nodes,
    IReadOnlyList<PagesConformationCameraPreset> CameraPresets);

public sealed record PagesConformationArtifacts(
    byte[] ConformationBytes,
    byte[] BoundManifestBytes,
    PagesConformationDocument Conformation,
    string ConformationDigest);

public static class PagesConformation
{
    private static readonly HashSet<string> CertifiedLayers =
        new(StringComparer.Ordinal)
        {
            "truth-dependency",
            "module-import",
            "frozen-prerequisite"
        };

    public static PagesConformationArtifacts Build(
        ReadOnlySpan<byte> atlasGraphBytes,
        ReadOnlySpan<byte> atlasManifestBytes,
        ReadOnlySpan<byte> previousConformationBytes = default)
    {
        using JsonDocument graphDocument = PagesStrictJson.Parse(
            atlasGraphBytes,
            "Pages atlas graph");
        using JsonDocument manifestDocument = PagesStrictJson.Parse(
            atlasManifestBytes,
            "Pages atlas manifest");

        JsonElement graph = graphDocument.RootElement;
        JsonElement manifest = manifestDocument.RootElement;
        ValidateBinding(
            atlasGraphBytes,
            graph,
            manifest,
            out string truthReleaseDigest,
            out string atlasGraphDigest,
            out string certifiedTopologyDigest,
            out string? topologyAtlasDigest);

        GraphProjection projection = GraphProjection.Read(graph);
        PreviousProjection? previous = previousConformationBytes.IsEmpty
            ? null
            : PreviousProjection.Read(previousConformationBytes);
        string? previousDigest = previous is null
            ? null
            : PagesStrictJson.Sha256(previousConformationBytes);

        IReadOnlyList<RegionBuild> regions = BuildRegions(projection.Nodes);
        Dictionary<string, PagesConformationPoint> intrinsic =
            SeedIntrinsicPositions(projection.Nodes, regions);
        RelaxIntrinsicPositions(projection, regions, intrinsic);
        ResolveExactCollisions(projection.Nodes, intrinsic);

        Dictionary<string, PagesConformationPoint> aligned =
            AlignPositions(projection, intrinsic, previous);
        IReadOnlyList<PagesConformationNode> nodes =
            BuildNodeRecords(projection, regions, intrinsic, aligned, previous);
        IReadOnlyList<PagesConformationRegion> regionRecords =
            BuildRegionRecords(regions, projection, intrinsic, aligned);
        IReadOnlyList<PagesConformationCameraPreset> cameras =
            BuildCameraPresets(nodes);

        var conformation = new PagesConformationDocument(
            PagesConformationSchemas.Conformation,
            truthReleaseDigest,
            atlasGraphDigest,
            certifiedTopologyDigest,
            topologyAtlasDigest,
            new PagesConformationProfile(
                PagesConformationSchemas.LayoutProfile,
                PagesConformationSchemas.LayoutProfileDigest),
            PagesConformationSchemas.FallbackStructureSource,
            previousDigest,
            new PagesCoordinateEncoding(
                "signed-fixed-point",
                PagesConformationSchemas.CoordinateScale),
            new PagesConformationAxes(
                "y",
                PagesConformationSchemas.DepthStep),
            regionRecords,
            nodes,
            cameras);

        byte[] conformationBytes =
            PagesStrictJson.SerializeValue(conformation);
        string conformationDigest =
            PagesStrictJson.Sha256(conformationBytes);
        byte[] boundManifest = BindManifest(
            manifestDocument.RootElement,
            conformationDigest);

        return new PagesConformationArtifacts(
            conformationBytes,
            boundManifest,
            conformation,
            conformationDigest);
    }

    private static void ValidateBinding(
        ReadOnlySpan<byte> atlasGraphBytes,
        JsonElement graph,
        JsonElement manifest,
        out string truthReleaseDigest,
        out string atlasGraphDigest,
        out string certifiedTopologyDigest,
        out string? topologyAtlasDigest)
    {
        string graphSchema = PagesStrictJson.RequiredString(
            graph,
            "schema_version",
            "$graph");
        if (!StringComparer.Ordinal.Equals(
                graphSchema,
                PagesAtlasSchemas.AtlasView))
        {
            throw new InvalidDataException(
                $"Pages atlas graph schema must be {PagesAtlasSchemas.AtlasView}.");
        }

        string manifestSchema = PagesStrictJson.RequiredString(
            manifest,
            "schema_version",
            "$manifest");
        if (!StringComparer.Ordinal.Equals(
                manifestSchema,
                PagesAtlasSchemas.AtlasManifest))
        {
            throw new InvalidDataException(
                $"Pages atlas manifest schema must be {PagesAtlasSchemas.AtlasManifest}.");
        }

        truthReleaseDigest = PagesStrictJson.RequiredString(
            manifest,
            "truth_release_digest",
            "$manifest");
        atlasGraphDigest = PagesStrictJson.RequiredString(
            manifest,
            "atlas_graph_digest",
            "$manifest");
        certifiedTopologyDigest = PagesStrictJson.RequiredString(
            manifest,
            "certified_topology_digest",
            "$manifest");
        PagesStrictJson.RequireSha256(
            truthReleaseDigest,
            "$manifest.truth_release_digest");
        PagesStrictJson.RequireSha256(
            atlasGraphDigest,
            "$manifest.atlas_graph_digest");
        PagesStrictJson.RequireSha256(
            certifiedTopologyDigest,
            "$manifest.certified_topology_digest");

        string actualGraphDigest = PagesStrictJson.Sha256(atlasGraphBytes);
        if (!StringComparer.Ordinal.Equals(
                atlasGraphDigest,
                actualGraphDigest))
        {
            throw new InvalidDataException(
                "Pages atlas manifest does not bind the exact atlas graph bytes.");
        }

        JsonElement snapshot = PagesStrictJson.RequiredProperty(
            graph,
            "source_snapshot",
            JsonValueKind.Object,
            "$graph");
        string graphRelease = PagesStrictJson.RequiredString(
            snapshot,
            "truth_release_digest",
            "$graph.source_snapshot");
        string graphTopology = PagesStrictJson.RequiredString(
            snapshot,
            "certified_topology_digest",
            "$graph.source_snapshot");
        if (!StringComparer.Ordinal.Equals(
                truthReleaseDigest,
                graphRelease) ||
            !StringComparer.Ordinal.Equals(
                certifiedTopologyDigest,
                graphTopology))
        {
            throw new InvalidDataException(
                "Pages atlas graph and manifest are bound to different release inputs.");
        }

        topologyAtlasDigest = null;
        if (manifest.TryGetProperty(
                "topology_atlas_digest",
                out JsonElement topologyAtlas) &&
            topologyAtlas.ValueKind != JsonValueKind.Null)
        {
            topologyAtlasDigest = topologyAtlas.GetString();
            if (topologyAtlasDigest is null)
            {
                throw new InvalidDataException(
                    "$manifest.topology_atlas_digest must be a digest or null.");
            }
            PagesStrictJson.RequireSha256(
                topologyAtlasDigest,
                "$manifest.topology_atlas_digest");
        }

        if (manifest.TryGetProperty(
                "conformation_digest",
                out JsonElement existing) &&
            existing.ValueKind != JsonValueKind.Null)
        {
            throw new InvalidDataException(
                "Input atlas manifest is already bound to a conformation.");
        }
    }

    private static byte[] BindManifest(
        JsonElement manifest,
        string conformationDigest)
    {
        JsonObject value = JsonNode.Parse(manifest.GetRawText())?.AsObject()
            ?? throw new InvalidDataException("Pages atlas manifest is null.");
        value["conformation_digest"] = conformationDigest;
        return PagesStrictJson.SerializeNode(value);
    }

    private static IReadOnlyList<RegionBuild> BuildRegions(
        IReadOnlyList<NodeBuild> nodes)
    {
        var groups = nodes
            .GroupBy(
                node => node.RegionLabel,
                StringComparer.Ordinal)
            .OrderBy(group => RegionOrder(group.Key))
            .ThenBy(group => group.Key, StringComparer.Ordinal)
            .ToArray();
        var regions = new List<RegionBuild>(groups.Length);
        for (int index = 0; index < groups.Length; index++)
        {
            string[] members = groups[index]
                .Select(node => node.Id)
                .Order(StringComparer.Ordinal)
                .ToArray();
            (int gridX, int gridZ) = SquareSpiral(index);
            regions.Add(new RegionBuild(
                RegionId(groups[index].Key, members),
                groups[index].Key,
                members,
                new PagesConformationPoint(
                    gridX * PagesConformationSchemas.RegionSpacing,
                    0,
                    gridZ * PagesConformationSchemas.RegionSpacing)));
        }

        return regions;
    }

    private static Dictionary<string, PagesConformationPoint>
        SeedIntrinsicPositions(
            IReadOnlyList<NodeBuild> nodes,
            IReadOnlyList<RegionBuild> regions)
    {
        var byId = nodes.ToDictionary(node => node.Id, StringComparer.Ordinal);
        var result = new Dictionary<string, PagesConformationPoint>(
            StringComparer.Ordinal);
        foreach (RegionBuild region in regions)
        {
            NodeBuild[] members = region.MemberNodeIds
                .Select(id => byId[id])
                .OrderBy(node => node.Depth)
                .ThenBy(node => node.Id, StringComparer.Ordinal)
                .ToArray();
            foreach (IGrouping<long, NodeBuild> depthGroup in members
                .GroupBy(node => node.Depth)
                .OrderBy(group => group.Key))
            {
                NodeBuild[] level = depthGroup
                    .OrderBy(node => node.Id, StringComparer.Ordinal)
                    .ToArray();
                int columns = CeilingSquareRoot(level.Length);
                int rows = (level.Length + columns - 1) / columns;
                for (int index = 0; index < level.Length; index++)
                {
                    int column = index % columns;
                    int row = index / columns;
                    long offsetX =
                        (2L * column - (columns - 1L)) *
                        PagesConformationSchemas.NodeSpacing / 2;
                    long offsetZ =
                        (2L * row - (rows - 1L)) *
                        PagesConformationSchemas.NodeSpacing / 2;
                    result[level[index].Id] =
                        new PagesConformationPoint(
                            region.SeedCentroid.X + offsetX,
                            depthGroup.Key * PagesConformationSchemas.DepthStep,
                            region.SeedCentroid.Z + offsetZ);
                }
            }
        }

        return result;
    }

    private static void RelaxIntrinsicPositions(
        GraphProjection graph,
        IReadOnlyList<RegionBuild> regions,
        Dictionary<string, PagesConformationPoint> positions)
    {
        var regionByNode = regions
            .SelectMany(region => region.MemberNodeIds.Select(
                id => (Id: id, Region: region)))
            .ToDictionary(pair => pair.Id, pair => pair.Region, StringComparer.Ordinal);

        for (int pass = 0;
            pass < PagesConformationSchemas.RelaxationPasses;
            pass++)
        {
            var next = new Dictionary<string, PagesConformationPoint>(
                StringComparer.Ordinal);
            foreach (NodeBuild node in graph.Nodes
                .OrderBy(item => item.Id, StringComparer.Ordinal))
            {
                PagesConformationPoint current = positions[node.Id];
                string[] neighbors = graph.Neighbors[node.Id]
                    .Where(positions.ContainsKey)
                    .Order(StringComparer.Ordinal)
                    .ToArray();
                RegionBuild region = regionByNode[node.Id];
                if (neighbors.Length == 0)
                {
                    next[node.Id] = current;
                    continue;
                }

                long averageX = Average(
                    neighbors.Select(id => positions[id].X));
                long averageZ = Average(
                    neighbors.Select(id => positions[id].Z));
                long x = (
                    4 * current.X +
                    2 * averageX +
                    region.SeedCentroid.X) / 7;
                long z = (
                    4 * current.Z +
                    2 * averageZ +
                    region.SeedCentroid.Z) / 7;
                next[node.Id] = new PagesConformationPoint(
                    Quantize(x),
                    current.Y,
                    Quantize(z));
            }

            foreach ((string id, PagesConformationPoint point) in next)
            {
                positions[id] = point;
            }
        }
    }

    private static void ResolveExactCollisions(
        IReadOnlyList<NodeBuild> nodes,
        Dictionary<string, PagesConformationPoint> positions)
    {
        foreach (IGrouping<(string Region, long Y), NodeBuild> group in nodes
            .GroupBy(node => (node.RegionLabel, positions[node.Id].Y)))
        {
            var occupied = new HashSet<(long X, long Z)>();
            foreach (NodeBuild node in group
                .OrderBy(item => positions[item.Id].X)
                .ThenBy(item => positions[item.Id].Z)
                .ThenBy(item => item.Id, StringComparer.Ordinal))
            {
                PagesConformationPoint point = positions[node.Id];
                long x = point.X;
                while (!occupied.Add((x, point.Z)))
                {
                    x += PagesConformationSchemas.NodeSpacing;
                }

                if (x != point.X)
                {
                    positions[node.Id] = point with { X = x };
                }
            }
        }
    }

    private static Dictionary<string, PagesConformationPoint> AlignPositions(
        GraphProjection graph,
        IReadOnlyDictionary<string, PagesConformationPoint> intrinsic,
        PreviousProjection? previous)
    {
        var result = new Dictionary<string, PagesConformationPoint>(
            StringComparer.Ordinal);
        foreach (NodeBuild node in graph.Nodes
            .OrderBy(item => item.Id, StringComparer.Ordinal))
        {
            PagesConformationPoint current = intrinsic[node.Id];
            if (previous is null)
            {
                result[node.Id] = current;
                continue;
            }

            if (previous.Nodes.TryGetValue(
                    node.Id,
                    out PreviousNode? prior))
            {
                result[node.Id] = new PagesConformationPoint(
                    Quantize((3 * prior.Aligned.X + current.X) / 4),
                    current.Y,
                    Quantize((3 * prior.Aligned.Z + current.Z) / 4));
                continue;
            }

            PreviousNode[] retainedNeighbors = graph.Neighbors[node.Id]
                .Where(previous.Nodes.ContainsKey)
                .Select(id => previous.Nodes[id])
                .OrderBy(item => item.NodeId, StringComparer.Ordinal)
                .ToArray();
            if (retainedNeighbors.Length == 0)
            {
                result[node.Id] = current;
                continue;
            }

            long neighborX = Average(
                retainedNeighbors.Select(item => item.Aligned.X));
            long neighborZ = Average(
                retainedNeighbors.Select(item => item.Aligned.Z));
            result[node.Id] = new PagesConformationPoint(
                Quantize((2 * neighborX + current.X) / 3),
                current.Y,
                Quantize((2 * neighborZ + current.Z) / 3));
        }

        return result;
    }

    private static IReadOnlyList<PagesConformationNode> BuildNodeRecords(
        GraphProjection graph,
        IReadOnlyList<RegionBuild> regions,
        IReadOnlyDictionary<string, PagesConformationPoint> intrinsic,
        IReadOnlyDictionary<string, PagesConformationPoint> aligned,
        PreviousProjection? previous)
    {
        var regionByNode = regions
            .SelectMany(region => region.MemberNodeIds.Select(
                id => (Id: id, region.RegionId)))
            .ToDictionary(pair => pair.Id, pair => pair.RegionId, StringComparer.Ordinal);
        return graph.Nodes
            .OrderBy(node => node.Id, StringComparer.Ordinal)
            .Select(node => new PagesConformationNode(
                node.Id,
                regionByNode[node.Id],
                node.Depth,
                intrinsic[node.Id],
                aligned[node.Id],
                MovementReasons(node, intrinsic[node.Id], previous)))
            .ToArray();
    }

    private static IReadOnlyList<string> MovementReasons(
        NodeBuild node,
        PagesConformationPoint intrinsic,
        PreviousProjection? previous)
    {
        if (previous is null)
        {
            return ["intrinsic-placement"];
        }

        if (!previous.Nodes.TryGetValue(node.Id, out PreviousNode? prior))
        {
            return ["new-node-neighborhood-seed"];
        }

        var reasons = new List<string> { "retained-node-alignment" };
        if (prior.TrueDepth != node.Depth)
        {
            reasons.Add("certified-depth-changed");
        }
        if (prior.Intrinsic.X != intrinsic.X ||
            prior.Intrinsic.Z != intrinsic.Z)
        {
            reasons.Add("intrinsic-structure-changed");
        }
        return reasons;
    }

    private static IReadOnlyList<PagesConformationRegion> BuildRegionRecords(
        IReadOnlyList<RegionBuild> regions,
        GraphProjection graph,
        IReadOnlyDictionary<string, PagesConformationPoint> intrinsic,
        IReadOnlyDictionary<string, PagesConformationPoint> aligned)
    {
        var byId = graph.Nodes.ToDictionary(node => node.Id, StringComparer.Ordinal);
        return regions
            .OrderBy(region => region.RegionId, StringComparer.Ordinal)
            .Select(region => new PagesConformationRegion(
                region.RegionId,
                region.Label,
                "pages-derived-fallback",
                region.MemberNodeIds,
                Centroid(region.MemberNodeIds.Select(id => intrinsic[id])),
                Centroid(region.MemberNodeIds.Select(id => aligned[id])),
                region.MemberNodeIds.Min(id => byId[id].Depth),
                region.MemberNodeIds.Max(id => byId[id].Depth)))
            .ToArray();
    }

    private static IReadOnlyList<PagesConformationCameraPreset>
        BuildCameraPresets(
            IReadOnlyList<PagesConformationNode> nodes)
    {
        PagesConformationPoint center = nodes.Count == 0
            ? new PagesConformationPoint(0, 0, 0)
            : Centroid(nodes.Select(node => node.Aligned));
        long horizontalRadius = nodes.Count == 0
            ? PagesConformationSchemas.RegionSpacing
            : nodes.Max(node => Math.Max(
                Math.Abs(node.Aligned.X - center.X),
                Math.Abs(node.Aligned.Z - center.Z)));
        long verticalRadius = nodes.Count == 0
            ? PagesConformationSchemas.DepthStep
            : nodes.Max(node => Math.Abs(node.Aligned.Y - center.Y));
        long distance = Math.Max(
            PagesConformationSchemas.RegionSpacing,
            horizontalRadius + verticalRadius +
            PagesConformationSchemas.RegionSpacing);
        return
        [
            new PagesConformationCameraPreset(
                "overview",
                new PagesConformationPoint(
                    center.X + distance,
                    center.Y + distance / 2,
                    center.Z + distance),
                center)
        ];
    }

    private static PagesConformationPoint Centroid(
        IEnumerable<PagesConformationPoint> points)
    {
        PagesConformationPoint[] values = points.ToArray();
        if (values.Length == 0)
        {
            return new PagesConformationPoint(0, 0, 0);
        }
        return new PagesConformationPoint(
            Average(values.Select(point => point.X)),
            Average(values.Select(point => point.Y)),
            Average(values.Select(point => point.Z)));
    }

    private static long Average(IEnumerable<long> values)
    {
        long[] items = values.ToArray();
        if (items.Length == 0)
        {
            return 0;
        }
        long sum = 0;
        foreach (long item in items)
        {
            sum = checked(sum + item);
        }
        return sum / items.Length;
    }

    private static long Quantize(long value)
    {
        const long quantum = 100;
        return value >= 0
            ? ((value + quantum / 2) / quantum) * quantum
            : ((value - quantum / 2) / quantum) * quantum;
    }

    private static int CeilingSquareRoot(int value)
    {
        if (value <= 1)
        {
            return 1;
        }
        int root = 1;
        while (checked(root * root) < value)
        {
            root++;
        }
        return root;
    }

    private static int RegionOrder(string label)
    {
        if (label.StartsWith("D5/S0", StringComparison.Ordinal)) return 0;
        if (label.StartsWith("D5/S1", StringComparison.Ordinal)) return 1;
        if (label.StartsWith("D5/S3", StringComparison.Ordinal)) return 2;
        if (label.StartsWith("D5/X_Frontier", StringComparison.Ordinal)) return 3;
        if (label.StartsWith("semantic", StringComparison.Ordinal)) return 5;
        return 4;
    }

    private static (int X, int Z) SquareSpiral(int index)
    {
        if (index == 0)
        {
            return (0, 0);
        }
        int x = 0;
        int z = 0;
        int direction = 0;
        int stepLength = 1;
        int visited = 0;
        while (visited < index)
        {
            for (int repeat = 0; repeat < 2; repeat++)
            {
                for (int step = 0;
                    step < stepLength && visited < index;
                    step++)
                {
                    switch (direction % 4)
                    {
                        case 0: x++; break;
                        case 1: z++; break;
                        case 2: x--; break;
                        default: z--; break;
                    }
                    visited++;
                }
                direction++;
            }
            stepLength++;
        }
        return (x, z);
    }

    private static string RegionId(
        string label,
        IReadOnlyList<string> memberIds)
    {
        var builder = new StringBuilder();
        builder.Append("pages-fallback-region.v1\n");
        builder.Append(PagesConformationSchemas.LayoutProfileDigest)
            .Append('\n');
        builder.Append(label).Append('\n');
        foreach (string id in memberIds)
        {
            builder.Append(id).Append('\n');
        }
        return "region:sha256:" + Convert.ToHexStringLower(
            SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString())));
    }

    private sealed record NodeBuild(
        string Id,
        string RegionLabel,
        long Depth);

    private sealed record RegionBuild(
        string RegionId,
        string Label,
        IReadOnlyList<string> MemberNodeIds,
        PagesConformationPoint SeedCentroid);

    private sealed record GraphProjection(
        IReadOnlyList<NodeBuild> Nodes,
        IReadOnlyDictionary<string, IReadOnlyList<string>> Neighbors)
    {
        public static GraphProjection Read(JsonElement root)
        {
            JsonElement nodesElement = PagesStrictJson.RequiredProperty(
                root,
                "nodes",
                JsonValueKind.Array,
                "$graph");
            var nodes = new List<NodeBuild>();
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (JsonElement node in nodesElement.EnumerateArray())
            {
                string id = PagesStrictJson.RequiredString(
                    node,
                    "id",
                    "$graph.nodes[]");
                if (!ids.Add(id))
                {
                    throw new InvalidDataException(
                        $"Pages atlas graph contains duplicate node id {id}.");
                }
                string kind = OptionalString(node, "kind") ?? "semantic";
                string layer = OptionalString(node, "layer") ?? "Root";
                string domain = OptionalString(node, "domain") ?? "Unclassified";
                long depth = OptionalDepth(node);
                string regionLabel = StringComparer.Ordinal.Equals(kind, "truth")
                    ? $"{layer} / {domain}"
                    : $"semantic / {kind}";
                nodes.Add(new NodeBuild(id, regionLabel, depth));
            }
            nodes.Sort((left, right) =>
                StringComparer.Ordinal.Compare(left.Id, right.Id));

            var neighbors = ids.ToDictionary(
                id => id,
                _ => new SortedSet<string>(StringComparer.Ordinal),
                StringComparer.Ordinal);
            JsonElement edgesElement = PagesStrictJson.RequiredProperty(
                root,
                "edges",
                JsonValueKind.Array,
                "$graph");
            foreach (JsonElement edge in edgesElement.EnumerateArray())
            {
                string? source = EndpointId(edge, "source");
                string? target = EndpointId(edge, "target");
                if (source is null || target is null ||
                    !ids.Contains(source) || !ids.Contains(target) ||
                    StringComparer.Ordinal.Equals(source, target))
                {
                    continue;
                }
                string layer = OptionalString(edge, "layer") ?? string.Empty;
                string status = OptionalString(edge, "status") ?? string.Empty;
                bool structural = CertifiedLayers.Contains(layer) ||
                    StringComparer.Ordinal.Equals(status, "certified") ||
                    layer.StartsWith("blueprint-", StringComparison.Ordinal);
                if (!structural)
                {
                    continue;
                }
                neighbors[source].Add(target);
                neighbors[target].Add(source);
            }

            return new GraphProjection(
                nodes,
                neighbors.ToDictionary(
                    pair => pair.Key,
                    pair => (IReadOnlyList<string>)pair.Value.ToArray(),
                    StringComparer.Ordinal));
        }

        private static string? EndpointId(
            JsonElement edge,
            string name)
        {
            if (!edge.TryGetProperty(name, out JsonElement endpoint))
            {
                return null;
            }
            if (endpoint.ValueKind == JsonValueKind.String)
            {
                return endpoint.GetString();
            }
            if (endpoint.ValueKind == JsonValueKind.Object &&
                endpoint.TryGetProperty("id", out JsonElement id) &&
                id.ValueKind == JsonValueKind.String)
            {
                return id.GetString();
            }
            return null;
        }

        private static long OptionalDepth(JsonElement node)
        {
            foreach (string field in new[]
                { "true_depth", "max_depth", "depth" })
            {
                if (node.TryGetProperty(field, out JsonElement value) &&
                    value.ValueKind == JsonValueKind.Number &&
                    value.TryGetInt64(out long depth) &&
                    depth >= 0)
                {
                    return depth;
                }
            }
            return 0;
        }
    }

    private sealed record PreviousNode(
        string NodeId,
        long TrueDepth,
        PagesConformationPoint Intrinsic,
        PagesConformationPoint Aligned);

    private sealed record PreviousProjection(
        IReadOnlyDictionary<string, PreviousNode> Nodes)
    {
        public static PreviousProjection Read(
            ReadOnlySpan<byte> bytes)
        {
            using JsonDocument document = PagesStrictJson.Parse(
                bytes,
                "Previous Pages conformation");
            JsonElement root = document.RootElement;
            string schema = PagesStrictJson.RequiredString(
                root,
                "schema_version",
                "$previous");
            if (!StringComparer.Ordinal.Equals(
                    schema,
                    PagesConformationSchemas.Conformation))
            {
                throw new InvalidDataException(
                    "Previous conformation has an unsupported schema.");
            }
            JsonElement profile = PagesStrictJson.RequiredProperty(
                root,
                "layout_profile",
                JsonValueKind.Object,
                "$previous");
            string profileDigest = PagesStrictJson.RequiredString(
                profile,
                "digest",
                "$previous.layout_profile");
            if (!StringComparer.Ordinal.Equals(
                    profileDigest,
                    PagesConformationSchemas.LayoutProfileDigest))
            {
                throw new InvalidDataException(
                    "Previous conformation uses a different layout profile.");
            }
            JsonElement encoding = PagesStrictJson.RequiredProperty(
                root,
                "coordinate_encoding",
                JsonValueKind.Object,
                "$previous");
            if (!encoding.TryGetProperty("scale", out JsonElement scale) ||
                !scale.TryGetInt32(out int value) ||
                value != PagesConformationSchemas.CoordinateScale)
            {
                throw new InvalidDataException(
                    "Previous conformation uses a different coordinate scale.");
            }

            JsonElement nodes = PagesStrictJson.RequiredProperty(
                root,
                "nodes",
                JsonValueKind.Array,
                "$previous");
            var result = new Dictionary<string, PreviousNode>(
                StringComparer.Ordinal);
            foreach (JsonElement node in nodes.EnumerateArray())
            {
                string id = PagesStrictJson.RequiredString(
                    node,
                    "node_id",
                    "$previous.nodes[]");
                long trueDepth = node.GetProperty("true_depth").GetInt64();
                var previous = new PreviousNode(
                    id,
                    trueDepth,
                    ReadPoint(node.GetProperty("intrinsic")),
                    ReadPoint(node.GetProperty("aligned")));
                if (!result.TryAdd(id, previous))
                {
                    throw new InvalidDataException(
                        $"Previous conformation contains duplicate node id {id}.");
                }
            }
            return new PreviousProjection(result);
        }

        private static PagesConformationPoint ReadPoint(
            JsonElement value) =>
            new(
                value.GetProperty("x").GetInt64(),
                value.GetProperty("y").GetInt64(),
                value.GetProperty("z").GetInt64());
    }

    private static string? OptionalString(
        JsonElement parent,
        string name)
    {
        if (!parent.TryGetProperty(name, out JsonElement value) ||
            value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }
        return value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
    }
}
