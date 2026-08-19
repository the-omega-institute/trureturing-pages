using System.Security.Cryptography;
using Trureturing.Pages.Core;

namespace Trureturing.Pages.Cli;

internal static class Program
{
    private static readonly string[] RequiredOptions =
    [
        "--truth-graph",
        "--snapshot",
        "--output",
        "--expected-digest",
    ];

    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0 || !string.Equals(args[0], "project", StringComparison.Ordinal))
            {
                throw new ProjectionException(
                    "usage: project --truth-graph PATH --snapshot PATH --output PATH --expected-digest SHA256");
            }

            var options = ParseOptions(args[1..]);
            var output = ProjectionFileService.ProjectAndWrite(
                options["--truth-graph"],
                options["--snapshot"],
                options["--output"],
                options["--expected-digest"]);
            var outputDigest = Convert.ToHexString(SHA256.HashData(output)).ToLowerInvariant();
            Console.Out.WriteLine($"PROJECTED {outputDigest} {options["--output"]}");
            return 0;
        }
        catch (ProjectionException exception)
        {
            Console.Error.WriteLine($"PROJECTOR_FAILED {exception.Message}");
            return 2;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"PROJECTOR_INTERNAL {exception.GetType().Name}: {exception.Message}");
            return 1;
        }
    }

    private static IReadOnlyDictionary<string, string> ParseOptions(string[] arguments)
    {
        if (arguments.Length % 2 != 0)
        {
            throw new ProjectionException("every option requires one value");
        }

        var options = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var index = 0; index < arguments.Length; index += 2)
        {
            var name = arguments[index];
            var value = arguments[index + 1];
            if (!RequiredOptions.Contains(name, StringComparer.Ordinal))
            {
                throw new ProjectionException($"unknown option: {name}");
            }

            if (string.IsNullOrWhiteSpace(value) || !options.TryAdd(name, value))
            {
                throw new ProjectionException($"missing or duplicate option: {name}");
            }
        }

        foreach (var required in RequiredOptions)
        {
            if (!options.ContainsKey(required))
            {
                throw new ProjectionException($"missing option: {required}");
            }
        }

        return options;
    }
}
