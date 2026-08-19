using System.Security.Cryptography;
using System.Text.Json;

namespace Trureturing.Pages.Core;

public static class ProjectionFileService
{
    public static byte[] ProjectAndWrite(
        string truthGraphPath,
        string sourceSnapshotPath,
        string outputPath,
        string expectedDigest) =>
        ProjectAndWrite(
            truthGraphPath,
            sourceSnapshotPath,
            outputPath,
            expectedDigest,
            beforeFinalInputCheck: null);

    internal static byte[] ProjectAndWrite(
        string truthGraphPath,
        string sourceSnapshotPath,
        string outputPath,
        string expectedDigest,
        Action? beforeFinalInputCheck)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(truthGraphPath);
        ArgumentException.ThrowIfNullOrWhiteSpace(sourceSnapshotPath);
        ArgumentException.ThrowIfNullOrWhiteSpace(outputPath);
        if (!IsSha256(expectedDigest))
        {
            throw new ProjectionException(
                "expected digest must be 64 lowercase hexadecimal characters");
        }

        try
        {
            var truthGraphBytes = File.ReadAllBytes(truthGraphPath);
            var sourceSnapshotBytes = File.ReadAllBytes(sourceSnapshotPath);
            var actualDigest = Convert.ToHexString(SHA256.HashData(truthGraphBytes))
                .ToLowerInvariant();
            var blessedDigest = ReadBlessedDigest(sourceSnapshotBytes);
            if (!string.Equals(blessedDigest, actualDigest, StringComparison.Ordinal))
            {
                throw new ProjectionException(
                    $"raw truth-graph digest {actualDigest} does not match blessed "
                    + $"truth_graph_sha256 {blessedDigest}");
            }

            if (!string.Equals(expectedDigest, actualDigest, StringComparison.Ordinal))
            {
                throw new ProjectionException(
                    $"raw truth-graph digest {actualDigest} does not match expected "
                    + $"digest {expectedDigest}");
            }

            var output = TruthGraphProjector.Project(truthGraphBytes, sourceSnapshotBytes);
            beforeFinalInputCheck?.Invoke();
            var finalTruthGraphBytes = File.ReadAllBytes(truthGraphPath);
            var finalSourceSnapshotBytes = File.ReadAllBytes(sourceSnapshotPath);
            if (!truthGraphBytes.AsSpan().SequenceEqual(finalTruthGraphBytes)
                || !sourceSnapshotBytes.AsSpan().SequenceEqual(finalSourceSnapshotBytes))
            {
                throw new ProjectionException(
                    "projection inputs changed before atomic install");
            }

            AtomicWrite(outputPath, output);
            return output;
        }
        catch (ProjectionException)
        {
            throw;
        }
        catch (Exception exception) when (
            exception is IOException
                or UnauthorizedAccessException
                or NotSupportedException)
        {
            throw new ProjectionException("projection file operation failed", exception);
        }
    }

    private static string ReadBlessedDigest(ReadOnlySpan<byte> sourceSnapshotUtf8)
    {
        using var snapshot = StrictJson.Parse(sourceSnapshotUtf8, "source snapshot");
        if (snapshot.RootElement.ValueKind != JsonValueKind.Object
            || !snapshot.RootElement.TryGetProperty("truth_graph_sha256", out var value)
            || value.ValueKind != JsonValueKind.String)
        {
            throw new ProjectionException(
                "source snapshot must contain string truth_graph_sha256");
        }

        var digest = value.GetString();
        if (!IsSha256(digest))
        {
            throw new ProjectionException(
                "source snapshot truth_graph_sha256 must be 64 lowercase hexadecimal characters");
        }

        return digest!;
    }

    private static bool IsSha256(string? digest)
    {
        if (digest is null || digest.Length != 64)
        {
            return false;
        }

        foreach (var value in digest)
        {
            if (!char.IsAsciiDigit(value) && value is not (>= 'a' and <= 'f'))
            {
                return false;
            }
        }

        return true;
    }

    private static void AtomicWrite(string outputPath, byte[] output)
    {
        var fullOutputPath = Path.GetFullPath(outputPath);
        var directory = Path.GetDirectoryName(fullOutputPath)
            ?? throw new ProjectionException("output path has no parent directory");
        if (!Directory.Exists(directory))
        {
            throw new ProjectionException($"output directory does not exist: {directory}");
        }

        var temporaryPath = Path.Combine(
            directory,
            Path.GetFileName(fullOutputPath) + ".tmp-" + Guid.NewGuid().ToString("N"));
        try
        {
            File.WriteAllBytes(temporaryPath, output);
            if (!File.ReadAllBytes(temporaryPath).AsSpan().SequenceEqual(output))
            {
                throw new ProjectionException("temporary projection bytes changed after write");
            }

            File.Move(temporaryPath, fullOutputPath, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporaryPath))
            {
                File.Delete(temporaryPath);
            }
        }
    }
}
