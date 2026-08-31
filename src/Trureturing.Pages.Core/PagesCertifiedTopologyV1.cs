using System.Globalization;
using System.Numerics;
using System.Text.Json;

namespace Trureturing.Pages.Core;

internal readonly record struct PagesAtlasRational
{
    public PagesAtlasRational(
        BigInteger numerator,
        BigInteger denominator)
    {
        if (numerator < 0)
        {
            throw new InvalidDataException(
                "Certified topology rational numerator must be non-negative.");
        }

        if (denominator <= 0)
        {
            throw new InvalidDataException(
                "Certified topology rational denominator must be positive.");
        }

        BigInteger divisor = BigInteger.GreatestCommonDivisor(
            numerator,
            denominator);
        if (divisor != BigInteger.One)
        {
            throw new InvalidDataException(
                "Certified topology rationals must already be gcd-reduced.");
        }

        Numerator = numerator;
        Denominator = denominator;
    }

    public BigInteger Numerator { get; }

    public BigInteger Denominator { get; }

    public override string ToString() =>
        Denominator == BigInteger.One
            ? Numerator.ToString(CultureInfo.InvariantCulture)
            : Numerator.ToString(CultureInfo.InvariantCulture) +
              "/" +
              Denominator.ToString(CultureInfo.InvariantCulture);
}

internal sealed record PagesAtlasNodeMetrics(
    string NodeId,
    long InDegree,
    long OutDegree,
    long MinDepth,
    long MaxDepth,
    long AncestorCount,
    long DescendantCount,
    long DescendantCost,
    PagesAtlasRational NormalizedReach,
    PagesAtlasRational DependencyBetweenness);

internal sealed record PagesAtlasCertifiedTopology(
    string TruthReleaseDigest,
    string AlgorithmProfileDigest,
    string ProducerCommit,
    IReadOnlyList<PagesAtlasNodeMetrics> Nodes);

internal static class PagesAtlasCertifiedTopologyReader
{
    public static PagesAtlasCertifiedTopology Read(
        JsonElement root)
    {
        PagesStrictJson.RequireExactProperties(
            root,
            [
                "schema_version",
                "truth_release_digest",
                "algorithm_profile_digest",
                "producer_commit",
                "nodes",
                "cycle_certificate",
                "dangling_reference_certificate"
            ],
            "$" );

        string schema = PagesStrictJson.RequiredString(
            root,
            "schema_version",
            "$" );
        if (!StringComparer.Ordinal.Equals(
                schema,
                PagesAtlasSchemas.CertifiedTopology))
        {
            throw new InvalidDataException(
                $"Certified topology schema must be {PagesAtlasSchemas.CertifiedTopology}.");
        }

        string truthReleaseDigest = PagesStrictJson.RequiredString(
            root,
            "truth_release_digest",
            "$" );
        string algorithmProfileDigest = PagesStrictJson.RequiredString(
            root,
            "algorithm_profile_digest",
            "$" );
        string producerCommit = PagesStrictJson.RequiredString(
            root,
            "producer_commit",
            "$" );
        PagesStrictJson.RequireSha256(
            truthReleaseDigest,
            "$.truth_release_digest");
        PagesStrictJson.RequireSha256(
            algorithmProfileDigest,
            "$.algorithm_profile_digest");
        PagesStrictJson.RequireGitCommit(
            producerCommit,
            "$.producer_commit");

        RequireCompleteCertificates(root);

        JsonElement nodes = PagesStrictJson.RequiredProperty(
            root,
            "nodes",
            JsonValueKind.Array,
            "$" );
        var result = new List<PagesAtlasNodeMetrics>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (JsonElement node in nodes.EnumerateArray())
        {
            PagesStrictJson.RequireExactProperties(
                node,
                [
                    "node_id",
                    "in_degree",
                    "out_degree",
                    "min_depth",
                    "max_depth",
                    "ancestor_count",
                    "descendant_count",
                    "descendant_cost",
                    "normalized_reach",
                    "dependency_betweenness"
                ],
                "$.nodes[]");
            string nodeId = PagesStrictJson.RequiredString(
                node,
                "node_id",
                "$.nodes[]");
            if (!ids.Add(nodeId))
            {
                throw new InvalidDataException(
                    $"Certified topology contains duplicate node_id {nodeId}.");
            }

            string path = $"$.nodes[{nodeId}]";
            result.Add(new PagesAtlasNodeMetrics(
                nodeId,
                PagesStrictJson.RequiredNonNegativeInt64(
                    node,
                    "in_degree",
                    path),
                PagesStrictJson.RequiredNonNegativeInt64(
                    node,
                    "out_degree",
                    path),
                PagesStrictJson.RequiredNonNegativeInt64(
                    node,
                    "min_depth",
                    path),
                PagesStrictJson.RequiredNonNegativeInt64(
                    node,
                    "max_depth",
                    path),
                PagesStrictJson.RequiredNonNegativeInt64(
                    node,
                    "ancestor_count",
                    path),
                PagesStrictJson.RequiredNonNegativeInt64(
                    node,
                    "descendant_count",
                    path),
                PagesStrictJson.RequiredNonNegativeInt64(
                    node,
                    "descendant_cost",
                    path),
                RequiredRational(
                    node,
                    "normalized_reach",
                    path),
                RequiredRational(
                    node,
                    "dependency_betweenness",
                    path)));
        }

        result.Sort((left, right) =>
            StringComparer.Ordinal.Compare(left.NodeId, right.NodeId));
        return new PagesAtlasCertifiedTopology(
            truthReleaseDigest,
            algorithmProfileDigest,
            producerCommit,
            result);
    }

    private static void RequireCompleteCertificates(
        JsonElement root)
    {
        JsonElement cycle = PagesStrictJson.RequiredProperty(
            root,
            "cycle_certificate",
            JsonValueKind.Object,
            "$" );
        PagesStrictJson.RequireExactProperties(
            cycle,
            ["status", "cycles"],
            "$.cycle_certificate");
        string cycleStatus = PagesStrictJson.RequiredString(
            cycle,
            "status",
            "$.cycle_certificate");
        JsonElement cycles = PagesStrictJson.RequiredProperty(
            cycle,
            "cycles",
            JsonValueKind.Array,
            "$.cycle_certificate");
        if (!StringComparer.Ordinal.Equals(cycleStatus, "acyclic") ||
            cycles.GetArrayLength() != 0)
        {
            throw new InvalidDataException(
                "Pages only consumes acyclic certified topology.");
        }

        JsonElement dangling = PagesStrictJson.RequiredProperty(
            root,
            "dangling_reference_certificate",
            JsonValueKind.Object,
            "$" );
        PagesStrictJson.RequireExactProperties(
            dangling,
            ["status", "dangling_references"],
            "$.dangling_reference_certificate");
        string danglingStatus = PagesStrictJson.RequiredString(
            dangling,
            "status",
            "$.dangling_reference_certificate");
        JsonElement danglingReferences =
            PagesStrictJson.RequiredProperty(
                dangling,
                "dangling_references",
                JsonValueKind.Array,
                "$.dangling_reference_certificate");
        if (!StringComparer.Ordinal.Equals(
                danglingStatus,
                "complete") ||
            danglingReferences.GetArrayLength() != 0)
        {
            throw new InvalidDataException(
                "Pages only consumes complete certified topology.");
        }
    }

    private static PagesAtlasRational RequiredRational(
        JsonElement parent,
        string name,
        string path)
    {
        JsonElement value = PagesStrictJson.RequiredProperty(
            parent,
            name,
            JsonValueKind.Object,
            path);
        PagesStrictJson.RequireExactProperties(
            value,
            ["numerator", "denominator"],
            $"{path}.{name}");
        return new PagesAtlasRational(
            PagesStrictJson.RequiredBigInteger(
                value,
                "numerator",
                $"{path}.{name}"),
            PagesStrictJson.RequiredBigInteger(
                value,
                "denominator",
                $"{path}.{name}"));
    }
}
